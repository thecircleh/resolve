"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  initialMessages: ChatMessage[];
  // For non-streaming surfaces (profile builder): send and resolve.
  onSend?: (text: string) => Promise<void>;
  // For streaming surfaces (sessions): a URL to POST to with SSE response.
  streamUrl?: string;
  // Called after a streamed turn completes, with the "done" payload.
  onStreamDone?: (done: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  isThinking?: boolean;
}

export default function ChatSurface({
  initialMessages,
  onSend,
  streamUrl,
  onStreamDone,
  disabled,
  disabledReason,
  placeholder,
  isThinking,
}: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isThinking, streamingText]);

  async function streamSend(text: string) {
    if (!streamUrl) return;
    setErrorBanner(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setStreamingText("");

    try {
      const res = await fetch(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        // Non-stream error (rate limit, validation, auth)
        const data = await res.json().catch(() => ({}));
        setStreamingText(null);
        setErrorBanner(
          (data as { error?: string }).error ||
            "Something went wrong. Try again in a moment.",
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === "delta") {
            assembled += payload.text;
            setStreamingText(assembled);
          } else if (payload.type === "done") {
            // Move the streamed text into the message list
            setMessages((m) => [
              ...m,
              { role: "assistant", content: assembled },
            ]);
            setStreamingText(null);
            if (onStreamDone) await onStreamDone(payload);
          } else if (payload.type === "error") {
            setStreamingText(null);
            setErrorBanner(payload.message);
          }
        }
      }
    } catch {
      setStreamingText(null);
      setErrorBanner(
        "Connection interrupted. Your message was saved — refresh and try again.",
      );
    }
  }

  async function submit() {
    const text = input.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    setInput("");
    try {
      if (streamUrl) {
        await streamSend(text);
      } else if (onSend) {
        setMessages((m) => [...m, { role: "user", content: text }]);
        await onSend(text);
      }
    } catch (err) {
      console.error(err);
      setErrorBanner("Something went wrong reaching the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-1 py-4 space-y-6"
      >
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
        {streamingText !== null && (
          <MessageBubble role="assistant" content={streamingText || "…"} />
        )}
        {(isThinking || (sending && streamingText === null)) && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="animate-pulse">•</span>
            <span className="animate-pulse delay-75">•</span>
            <span className="animate-pulse delay-150">•</span>
          </div>
        )}
      </div>

      {errorBanner && (
        <div className="mb-3 p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md">
          {errorBanner}
        </div>
      )}

      <div className="border-t border-canvas-border pt-4">
        {disabled ? (
          <div className="p-3 text-sm text-ink-muted bg-canvas-soft border border-canvas-border rounded-md">
            {disabledReason || "This session is complete."}
          </div>
        ) : (
          <>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder || "Type your response..."}
              disabled={sending}
              rows={3}
              className="w-full px-3 py-2 border border-canvas-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-ink-muted">
                Cmd/Ctrl + Enter to send
              </p>
              <button
                onClick={submit}
                disabled={sending || !input.trim()}
                className="px-4 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "Working..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-3 rounded-lg bg-accent text-white whitespace-pre-wrap text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[95%]">
      <div className="text-xs uppercase tracking-wide text-ink-muted mb-1">
        Resolve
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink prose-resolve">
        {content}
      </div>
    </div>
  );
}
