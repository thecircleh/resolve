// Simple session-token auth using signed JWTs in an HttpOnly cookie.
// Magic-link flow: user requests a link -> we email them a one-time token
// -> they click -> we mint a session JWT -> subsequent requests carry the
// JWT in a cookie.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "./db";

const SESSION_COOKIE_NAME = "resolve_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAGIC_LINK_TTL_SECONDS = 60 * 15; // 15 minutes

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

// ----- Magic-link tokens ----------------------------------------------

export interface MagicLinkOptions {
  // Defaults to MAGIC_LINK_TTL_SECONDS. Invites use a much longer window,
  // since an invite email may sit unread for a day or more.
  ttlSeconds?: number;
  // Whether to mint a 6-digit native-app code alongside the link.
  // Deliberately off for long-lived invite tokens: a 6-digit code is only
  // 1,000,000 possibilities, which is fine for 15 minutes and not fine for
  // a week. Invitees who are on mobile request a fresh short-lived code
  // from the normal sign-in screen instead.
  withCode?: boolean;
}

export async function createMagicLinkToken(
  userId: string,
  options: MagicLinkOptions = {},
): Promise<{ token: string; code: string | null }> {
  const { ttlSeconds = MAGIC_LINK_TTL_SECONDS, withCode = true } = options;

  const token = randomBytes(32).toString("base64url");
  const code = withCode
    ? String(Math.floor(100000 + Math.random() * 900000))
    : null;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.loginToken.create({
    data: { userId, token, code, expiresAt },
  });
  return { token, code };
}

export async function consumeMagicLinkToken(
  token: string,
): Promise<{ userId: string } | null> {
  const record = await db.loginToken.findUnique({ where: { token } });
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  // Access can be revoked after a link is issued but before it is used.
  const user = await db.user.findUnique({
    where: { id: record.userId },
    select: { revokedAt: true },
  });
  if (!user || user.revokedAt) return null;

  await db.loginToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  await db.user.update({
    where: { id: record.userId },
    data: { lastLoginAt: new Date() },
  });

  return { userId: record.userId };
}

// Native-app flow: verify a 6-digit code for a given email.
export async function consumeCodeToken(
  email: string,
  code: string,
): Promise<{ userId: string } | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  if (user.revokedAt) return null;

  const record = await db.loginToken.findFirst({
    where: {
      userId: user.id,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;

  await db.loginToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return { userId: user.id };
}

// ----- Session JWTs ----------------------------------------------------

export async function createSessionJwt(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function createSessionCookie(userId: string): Promise<void> {
  const jwt = await createSessionJwt(userId);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function verifyJwt(jwt: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jwt, getSecret());
    if (typeof payload.userId !== "string") return null;
    return payload.userId;
  } catch {
    return null;
  }
}

// Accepts either the session cookie (web) or an Authorization: Bearer
// header (native app). Header wins if both are present.
export async function getSessionUserId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const authz = h.get("authorization");
    if (authz?.startsWith("Bearer ")) {
      const fromHeader = await verifyJwt(authz.slice(7).trim());
      if (fromHeader) return fromHeader;
    }
  } catch {
    // headers() unavailable in some contexts; fall through to cookie
  }

  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!cookie) return null;
    return verifyJwt(cookie.value);
  } catch {
    return null;
  }
}

export async function requireUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  // A session JWT lives 30 days, so revocation has to be enforced here as
  // well as at sign-in — otherwise a revoked user keeps working until
  // their existing cookie happens to expire.
  if (!user || user.revokedAt) return null;
  return user;
}
