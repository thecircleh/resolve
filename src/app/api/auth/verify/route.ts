import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkToken, createSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", url));
  }

  const result = await consumeMagicLinkToken(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", url));
  }

  await createSessionCookie(result.userId);

  return NextResponse.redirect(new URL("/dashboard", url));
}
