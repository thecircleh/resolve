// One-time migration off the BETA_ALLOWLIST env var.
//
// Creates a User row for every address in BETA_ALLOWLIST that does not
// have one yet, so nobody who was allowlisted but had not yet signed in
// gets locked out when the env var stops being consulted.
//
// It sends no email — these people were already told about the beta.
// Use "Resend invite" on the dashboard for anyone who needs a fresh link.
// Once this has been run, BETA_ALLOWLIST can be deleted from Vercel.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { log } from "@/lib/logger";

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emails = Array.from(
    new Set(
      (process.env.BETA_ALLOWLIST || "")
        .split(",")
        .map((e) => e.toLowerCase().trim())
        .filter((e) => e.includes("@")),
    ),
  );

  if (emails.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, skipped: 0, emails: [] });
  }

  const existing = await db.user.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const have = new Set(existing.map((u) => u.email));
  const toCreate = emails.filter((e) => !have.has(e));

  if (toCreate.length > 0) {
    await db.user.createMany({
      data: toCreate.map((email) => ({
        email,
        invitedAt: new Date(),
        invitedBy: admin.email,
      })),
      skipDuplicates: true,
    });
  }

  log.info("allowlist_imported", {
    by: admin.email,
    imported: toCreate.length,
    skipped: emails.length - toCreate.length,
  });

  return NextResponse.json({
    ok: true,
    imported: toCreate.length,
    skipped: emails.length - toCreate.length,
    emails: toCreate,
  });
}
