// Session message endpoint — streaming, rate-limited, retried, logged.
//
// Response is a Server-Sent-Events stream with three event types:
//   data: {"type":"delta","text":"..."}      — incremental assistant text
//   data: {"type":"done", ...sessionState}   — final state after the turn
//   data: {"type":"error","message":"..."}   — user-displayable error

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/logger";
import { runTurnStream } from "@/resolve/orchestrator";
import type { ChatMessage, PromptId } from "@/resolve/types";
import type { ActivePrompt, SessionState } from "@prisma/client";

// Streaming LLM turns can exceed default serverless timeouts.
// Requires Vercel Pro. On hobby plans this is capped lower.
export const maxDuration = 120;

const bodySchema = z.object({
  message: z.string().min(1).max(20000),
});

function activePromptToPromptId(a: ActivePrompt): PromptId {
  switch (a) {
    case "SITUATION_CLARIFIER":
      return "situation-clarifier";
    case "SALES_PLANNING":
      return "sales-planning";
    case "DECISION_MAKER":
      return "decision-maker";
    case "BUSINESS_PLANNER":
      return "business-planner";
    case "WORKFLOW_ARCHITECT":
      return "workflow-architect";
    default:
      throw new Error(`Unknown active prompt: ${a}`);
  }
}

function enginePromptIdToActivePrompt(
  id: "decision-maker" | "business-planner" | "workflow-architect",
): ActivePrompt {
  switch (id) {
    case "decision-maker":
      return "DECISION_MAKER";
    case "business-planner":
      return "BUSINESS_PLANNER";
    case "workflow-architect":
      return "WORKFLOW_ARCHITECT";
  }
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { id: sessionId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid message" }), {
      status: 400,
    });
  }

  // Rate limiting
  const rate = await checkRateLimit(user.id);
  if (!rate.allowed) {
    log.warn("rate_limited", { userId: user.id });
    return new Response(JSON.stringify({ error: rate.reason }), {
      status: 429,
    });
  }

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session || session.userId !== user.id) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
    });
  }

  if (
    session.state === "MONITOR_LOGGED" ||
    session.state === "OUTPUT_DELIVERED"
  ) {
    return new Response(
      JSON.stringify({ error: "This session is complete." }),
      { status: 400 },
    );
  }

  if (!user.profile?.profileText) {
    return new Response(
      JSON.stringify({
        error: "No Business Context Profile found. Please build one first.",
      }),
      { status: 400 },
    );
  }

  // Save the incoming user message before starting the stream
  await db.message.create({
    data: { sessionId, role: "USER", content: parsed.data.message },
  });

  const historyForModel: ChatMessage[] = [
    ...session.messages.map((m: { role: string; content: string }) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content: parsed.data.message },
  ];

  const currentPromptId = activePromptToPromptId(session.activePrompt);
  const profileText = user.profile.profileText;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(sse(obj)));

      try {
        const result = await runTurnStream({
          activePrompt: currentPromptId,
          profileText,
          conversation: historyForModel,
          onDelta: (text) => send({ type: "delta", text }),
        });

        // ----- State transitions -----
        let newState: SessionState = session.state;
        let newActivePrompt: ActivePrompt = session.activePrompt;
        let laneClassification = session.laneClassification;
        let tierClassification = session.tierClassification;
        let briefingJson = session.briefingJson;
        let outputJson = session.outputJson;
        let monitorNoteJson = session.monitorNoteJson;

        if (result.signal.type === "BRIEFING_READY") {
          newState = "ENGINE_ACTIVE";
          newActivePrompt = enginePromptIdToActivePrompt(result.signal.engine);
          briefingJson = { text: result.displayText } as unknown as object;
          const laneMatch = result.displayText.match(
            /Lane Classification:\s*([^\n]+)/i,
          );
          const tierMatch = result.displayText.match(
            /Tier Classification:\s*([^\n]+)/i,
          );
          if (laneMatch) laneClassification = laneMatch[1].trim();
          if (tierMatch) tierClassification = tierMatch[1].trim();
        } else if (result.signal.type === "MONITOR_LOGGED") {
          newState = "MONITOR_LOGGED";
          monitorNoteJson = { text: result.displayText } as unknown as object;
          laneClassification = "MONITOR";
        } else if (result.signal.type === "OUTPUT_DELIVERED") {
          newState = "OUTPUT_DELIVERED";
          outputJson = { text: result.displayText } as unknown as object;
        }

        // Save assistant message with token accounting
        await db.message.create({
          data: {
            sessionId,
            role: "ASSISTANT",
            content: result.displayText,
            fromPrompt: session.activePrompt,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheWriteTokens: result.usage.cacheWriteTokens,
          },
        });

        const title =
          session.title ||
          (session.messages.length === 0
            ? parsed.data.message.slice(0, 80)
            : null);

        await db.session.update({
          where: { id: sessionId },
          data: {
            state: newState,
            activePrompt: newActivePrompt,
            laneClassification,
            tierClassification,
            briefingJson: briefingJson ?? undefined,
            outputJson: outputJson ?? undefined,
            monitorNoteJson: monitorNoteJson ?? undefined,
            title: title ?? session.title,
          },
        });

        log.info("turn_complete", {
          sessionId,
          userId: user.id,
          prompt: currentPromptId,
          signal: result.signal.type,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
        });

        send({
          type: "done",
          state: newState,
          activePrompt: newActivePrompt,
          laneClassification,
          tierClassification,
          signal: result.signal,
          nextActionHint:
            result.signal.type === "BRIEFING_READY"
              ? "engine_ready_for_opening"
              : "awaiting_user",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("turn_failed", { sessionId, userId: user.id, message });
        await db.errorLog
          .create({
            data: {
              userId: user.id,
              sessionId,
              context: "session_message",
              message,
            },
          })
          .catch(() => {});
        send({
          type: "error",
          message:
            "The system had trouble completing that response. Your message was saved — try sending it again in a moment.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
