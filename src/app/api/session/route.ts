import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const createSchema = z.object({
  entryPrompt: z.enum(["SITUATION_CLARIFIER", "SALES_PLANNING"]),
});

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await db.session.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      state: true,
      entryPrompt: true,
      laneClassification: true,
      tierClassification: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.profile || user.profile.status !== "FINALIZED") {
    return NextResponse.json(
      { error: "Please complete your Business Context Profile first." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const activePrompt =
    parsed.data.entryPrompt === "SITUATION_CLARIFIER"
      ? "SITUATION_CLARIFIER"
      : "SALES_PLANNING";

  const session = await db.session.create({
    data: {
      userId: user.id,
      entryPrompt: parsed.data.entryPrompt,
      activePrompt,
      state: "ENTRY_ACTIVE",
    },
  });

  return NextResponse.json({ sessionId: session.id });
}
