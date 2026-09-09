import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = user.profile ?? (await db.profile.create({
    data: { userId: user.id, builderMessages: [] },
  }));

  return NextResponse.json({
    status: profile.status,
    profileText: profile.profileText,
    profileVersion: profile.profileVersion,
    builderMessages: profile.builderMessages,
  });
}
