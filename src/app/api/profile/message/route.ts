import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/logger";
import { runTurn } from "@/resolve/orchestrator";
import type { ChatMessage } from "@/resolve/types";

export const maxDuration = 120;

const bodySchema = z.object({
  message: z.string().min(1).max(10000),
});

interface StoredMsg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const rate = await checkRateLimit(user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.reason }, { status: 429 });
  }

  const profile =
    user.profile ??
    (await db.profile.create({
      data: { userId: user.id, builderMessages: [] },
    }));

  const existing: StoredMsg[] = Array.isArray(profile.builderMessages)
    ? (profile.builderMessages as unknown as StoredMsg[])
    : [];

  const conversation: ChatMessage[] = [
    ...existing,
    { role: "user", content: parsed.data.message },
  ];

  try {
    const result = await runTurn({
      activePrompt: "business-context-builder",
      profileText: null,
      conversation,
      includeSpine: false,
    });

    const updatedMessages: StoredMsg[] = [
      ...conversation,
      { role: "assistant", content: result.displayText },
    ];

    let profileText: string | undefined;
    let profileVersion: string | undefined;
    let status = profile.status;

    if (result.signal.type === "PROFILE_FINALIZED") {
      const profileMatch = result.displayText.match(
        /RESOLVE BUSINESS CONTEXT PROFILE[\s\S]+$/,
      );
      if (profileMatch) {
        profileText = profileMatch[0].trim();
        profileVersion = "1.0";
        status = "FINALIZED";
      }
    }

    await db.profile.update({
      where: { id: profile.id },
      data: {
        builderMessages: updatedMessages as unknown as object,
        profileText: profileText ?? profile.profileText,
        profileVersion: profileVersion ?? profile.profileVersion,
        status,
      },
    });

    log.info("profile_turn_complete", {
      userId: user.id,
      finalized: result.signal.type === "PROFILE_FINALIZED",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return NextResponse.json({
      assistant: result.displayText,
      signal: result.signal,
      finalized: result.signal.type === "PROFILE_FINALIZED",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("profile_turn_failed", { userId: user.id, message });
    await db.errorLog
      .create({
        data: { userId: user.id, context: "profile_message", message },
      })
      .catch(() => {});
    return NextResponse.json(
      {
        error:
          "The system had trouble completing that response. Try again in a moment — your previous answers are saved.",
      },
      { status: 502 },
    );
  }
}
