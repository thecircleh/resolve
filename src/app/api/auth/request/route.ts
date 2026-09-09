import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createMagicLinkToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  // Beta allowlist check
  const allowlist = (process.env.BETA_ALLOWLIST || "").trim();
  if (allowlist.length > 0) {
    const allowed = allowlist
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);
    if (!allowed.includes(email)) {
      // Return success anyway (don't leak allowlist membership)
      return NextResponse.json({ ok: true });
    }
  }

  // Find or create user
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const { token, code } = await createMagicLinkToken(user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const magicLinkUrl = `${appUrl}/api/auth/verify?token=${token}`;

  try {
    await sendMagicLinkEmail(email, magicLinkUrl, code);
  } catch (err) {
    console.error("Failed to send magic link email:", err);
    // In dev, log the URL so the developer can proceed without email
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Magic link for ${email}: ${magicLinkUrl} (code ${code})`);
    }
  }

  return NextResponse.json({ ok: true });
}
