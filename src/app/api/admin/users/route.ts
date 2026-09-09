// Beta tester management. Administrators only.
//
//   GET   — list every user with invite and activity status
//   POST  — add a tester by email and send the invite email
//   PATCH — resend an invite, or revoke / restore access
//
// There is deliberately no delete. Deleting a User cascades to their
// sessions, messages and profile, which is unrecoverable beta data.
// Revoking blocks sign-in while keeping all of it.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { createMagicLinkToken } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import { appUrlFrom } from "@/lib/url";
import { log } from "@/lib/logger";

const INVITE_TTL_DAYS = Math.max(
  1,
  parseInt(process.env.INVITE_TTL_DAYS || "7", 10) || 7,
);
const INVITE_TTL_SECONDS = INVITE_TTL_DAYS * 24 * 60 * 60;

// Sends a fresh long-lived invite link. Returns false if the email could
// not be delivered, so the caller can tell the admin rather than silently
// leaving a tester with no way in.
async function sendInvite(
  req: NextRequest,
  user: { id: string; email: string },
): Promise<{ sent: boolean; error?: string }> {
  const { token } = await createMagicLinkToken(user.id, {
    ttlSeconds: INVITE_TTL_SECONDS,
    withCode: false,
  });
  const appUrl = appUrlFrom(req);

  try {
    await sendInviteEmail(user.email, `${appUrl}/api/auth/verify?token=${token}`, {
      expiresInDays: INVITE_TTL_DAYS,
      loginUrl: `${appUrl}/login`,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("invite_email_failed", { email: user.email, error: message });
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Invite for ${user.email}: ${appUrl}/api/auth/verify?token=${token}`);
    }
    return { sent: false, error: message };
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      createdAt: true,
      invitedAt: true,
      invitedBy: true,
      lastLoginAt: true,
      revokedAt: true,
      profile: { select: { status: true } },
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin || isAdminEmail(u.email),
      adminViaEnv: !u.isAdmin && isAdminEmail(u.email),
      createdAt: u.createdAt,
      invitedAt: u.invitedAt,
      invitedBy: u.invitedBy,
      lastLoginAt: u.lastLoginAt,
      revoked: Boolean(u.revokedAt),
      profileStatus: u.profile?.status ?? null,
      sessionCount: u._count.sessions,
    })),
    inviteTtlDays: INVITE_TTL_DAYS,
    legacyAllowlistCount: (process.env.BETA_ALLOWLIST || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean).length,
  });
}

const postSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await db.user.findUnique({ where: { email } });

  // Adding someone who is already there is treated as "re-invite", and
  // un-revokes them. That is almost always what was meant, and it avoids
  // a dead end where the admin cannot work out why nothing happened.
  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          invitedAt: new Date(),
          invitedBy: admin.email,
        },
      })
    : await db.user.create({
        data: { email, invitedAt: new Date(), invitedBy: admin.email },
      });

  const result = await sendInvite(req, user);
  log.info("tester_invited", {
    email,
    by: admin.email,
    existed: Boolean(existing),
    emailSent: result.sent,
  });

  return NextResponse.json({
    ok: true,
    emailSent: result.sent,
    emailError: result.error ?? null,
    alreadyExisted: Boolean(existing),
    wasRevoked: Boolean(existing?.revokedAt),
  });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["resend", "revoke", "restore"]),
});

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { userId, action } = parsed.data;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "revoke") {
    // Guard against an admin locking themselves out of the dashboard.
    if (user.id === admin.id) {
      return NextResponse.json(
        { error: "You cannot revoke your own access." },
        { status: 400 },
      );
    }
    await db.user.update({
      where: { id: userId },
      data: { revokedAt: new Date() },
    });
    // Outstanding links should stop working immediately, not linger.
    await db.loginToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    log.info("tester_revoked", { email: user.email, by: admin.email });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore") {
    await db.user.update({
      where: { id: userId },
      data: { revokedAt: null },
    });
    log.info("tester_restored", { email: user.email, by: admin.email });
    return NextResponse.json({ ok: true });
  }

  // resend
  if (user.revokedAt) {
    return NextResponse.json(
      { error: "Restore access before resending an invite." },
      { status: 400 },
    );
  }
  await db.user.update({
    where: { id: userId },
    data: { invitedAt: new Date(), invitedBy: admin.email },
  });
  const result = await sendInvite(req, user);
  log.info("invite_resent", {
    email: user.email,
    by: admin.email,
    emailSent: result.sent,
  });

  return NextResponse.json({
    ok: true,
    emailSent: result.sent,
    emailError: result.error ?? null,
  });
}
