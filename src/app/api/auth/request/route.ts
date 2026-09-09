// Magic-link sign-in request.
//
// Access control: the User table IS the beta allowlist. An email with no
// User row, or a row that has been revoked, gets no email. Administrators
// add testers on /admin, which creates the row and sends the invite.
//
// The one exception is bootstrap: an address listed in ADMIN_EMAILS is
// auto-provisioned on first request, so the first administrator can sign
// in to an empty database and start adding people.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createMagicLinkToken } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { sendMagicLinkEmail } from "@/lib/email";
import { appUrlFrom } from "@/lib/url";
import { log } from "@/lib/logger";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  let email = "";

  try {
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    email = parsed.data.email.toLowerCase().trim();

    let user = await db.user.findUnique({ where: { email } });

    if (!user) {
      if (!isAdminEmail(email)) {
        // Not invited. Return success anyway so the endpoint cannot be
        // used to discover who is in the beta.
        log.info("auth_request_not_invited", { email });
        return NextResponse.json({ ok: true });
      }
      // Bootstrap the first administrator.
      user = await db.user.create({ data: { email, isAdmin: true } });
      log.info("auth_admin_bootstrapped", { email });
    }

    if (user.revokedAt) {
      log.info("auth_request_revoked", { email });
      return NextResponse.json({ ok: true });
    }

    const { token, code } = await createMagicLinkToken(user.id);
    const appUrl = appUrlFrom(req);
    const magicLinkUrl = `${appUrl}/api/auth/verify?token=${token}`;

    try {
      await sendMagicLinkEmail(email, magicLinkUrl, code);
    } catch (err) {
      log.error("magic_link_email_failed", {
        email,
        error: err instanceof Error ? err.message : String(err),
      });
      // In dev, log the URL so the developer can proceed without email.
      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Magic link for ${email}: ${magicLinkUrl} (code ${code})`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Prisma attaches a `code` (P1001 unreachable, P2021 table missing,
    // etc.) that says exactly what is wrong. Log it, and echo a short
    // reference back so a failure can be diagnosed without log access.
    const e = err as { code?: string; name?: string; message?: string };
    const reference = e.code || e.name || "UNKNOWN";

    log.error("auth_request_failed", {
      email,
      code: e.code ?? null,
      name: e.name ?? null,
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      {
        error: "Authentication service is temporarily unavailable",
        reference,
      },
      { status: 500 },
    );
  }
}
