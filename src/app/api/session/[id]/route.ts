import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const session = await db.session.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: session.id,
    state: session.state,
    entryPrompt: session.entryPrompt,
    activePrompt: session.activePrompt,
    laneClassification: session.laneClassification,
    tierClassification: session.tierClassification,
    title: session.title,
    outputJson: session.outputJson,
    monitorNoteJson: session.monitorNoteJson,
    messages: session.messages.map(
      (m: { role: string; content: string; createdAt: Date }) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }),
    ),
  });
}
