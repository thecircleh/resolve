// Native-app sign-in: exchange email + 6-digit code for a Bearer JWT.
// The web flow continues to use the cookie-based /api/auth/verify link.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeCodeToken, createSessionJwt } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const result = await consumeCodeToken(email, parsed.data.code);
  if (!result) {
    return NextResponse.json(
      { error: "Invalid or expired code. Request a new sign-in email." },
      { status: 401 },
    );
  }

  const token = await createSessionJwt(result.userId);
  return NextResponse.json({ token });
}
