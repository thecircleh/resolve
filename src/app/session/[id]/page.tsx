"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import ChatSurface, { type ChatMessage } from "@/components/ChatSurface";
import { useRouter } from "next/navigation";

interface SessionData {
  id: string;
  state: string;
  entryPrompt: string;
  activePrompt: string;
  laneClassification: string | null;
  tierClassification: string | null;
  title: string | null;
  outputJson: { text: string } | null;
  monitorNoteJson: { text: string } | null;
  messages: Array<{
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
  }>;
}

const SYNTHETIC = new Set([
  "I'm ready to begin.",
  "The briefing above is my input. Please proceed with the analysis.",
]);

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const kickoffSentRef = useRef(false);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/session/${id}`);
    if (r.status === 404) {
      setNotFound(true);
      return;
    }
    if (r.ok) setData(await r.json());
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-kickoff for empty sessions: stream the opening turn.
  useEffect(() => {
    if (!data || data.messages.length > 0 || kickoffSentRef.current) return;
    kickoffSentRef.current = true;
    void (async () => {
      await fetch(`/api/session/${id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "I'm ready to begin." }),
      })
        .then((r) => r.body?.getReader())
        .then(async (reader) => {
          // Drain the stream; we refresh from DB at the end.
          if (!reader) return;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        })
        .catch(() => {});
      await refresh();
    })();
  }, [data, id, refresh]);

  // After a streamed turn completes: if the entry handed off to an engine,
  // immediately fire the engine's opening turn.
  const onStreamDone = useCallback(
    async (done: Record<string, unknown>) => {
      if (done.nextActionHint === "engine_ready_for_opening") {
        await fetch(`/api/session/${id}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              "The briefing above is my input. Please proceed with the analysis.",
          }),
        })
          .then((r) => r.body?.getReader())
          .then(async (reader) => {
            if (!reader) return;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done: d } = await reader.read();
              if (d) break;
            }
          })
          .catch(() => {});
      }
      await refresh();
    },
    [id, refresh],
  );

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-ink-muted">Session not found.</p>
        <a href="/dashboard" className="mt-4 inline-block text-sm underline">
          Back to sessions
        </a>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-ink-muted">
        Loading...
      </div>
    );
  }

  const messages: ChatMessage[] = data.messages
    .filter((m) => !(m.role === "USER" && SYNTHETIC.has(m.content.trim())))
    .map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const isComplete =
    data.state === "OUTPUT_DELIVERED" || data.state === "MONITOR_LOGGED";

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {data.title || "Session"}
          </h1>
          <div className="mt-1 text-xs text-ink-muted uppercase tracking-wide">
            {data.laneClassification && data.tierClassification
              ? `${data.laneClassification} · ${data.tierClassification} · ${data.state.replace(/_/g, " ")}`
              : data.state.replace(/_/g, " ")}
          </div>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-ink-muted hover:text-ink"
        >
          Back
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="h-[70vh]">
          <ChatSurface
            initialMessages={messages}
            streamUrl={`/api/session/${id}/message`}
            onStreamDone={onStreamDone}
            disabled={isComplete}
            disabledReason={
              data.state === "MONITOR_LOGGED"
                ? "This issue was routed to Monitor lane. Tracking note logged."
                : "The session is complete. Output delivered below."
            }
            placeholder="Type your response..."
          />
        </div>

        <aside className="text-sm space-y-4">
          <div className="p-4 border border-canvas-border rounded-md">
            <div className="font-semibold text-xs uppercase tracking-wide text-ink-muted mb-2">
              Session
            </div>
            <div>
              <span className="text-ink-muted">Entry:</span>{" "}
              {data.entryPrompt.replace(/_/g, " ").toLowerCase()}
            </div>
            <div>
              <span className="text-ink-muted">Active:</span>{" "}
              {data.activePrompt.replace(/_/g, " ").toLowerCase()}
            </div>
            {data.laneClassification && (
              <div>
                <span className="text-ink-muted">Lane:</span>{" "}
                {data.laneClassification}
              </div>
            )}
            {data.tierClassification && (
              <div>
                <span className="text-ink-muted">Tier:</span>{" "}
                {data.tierClassification}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
