"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewSession() {
  const router = useRouter();
  const [creating, setCreating] = useState<null | "SITUATION_CLARIFIER" | "SALES_PLANNING">(null);

  async function start(entry: "SITUATION_CLARIFIER" | "SALES_PLANNING") {
    setCreating(entry);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryPrompt: entry }),
    });
    if (!res.ok) {
      setCreating(null);
      return;
    }
    const data = await res.json();
    router.push(`/session/${data.sessionId}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Start a session</h1>
      <p className="mt-2 text-ink-soft">
        Pick the entry point that matches your issue. Most sessions start with
        Situation Clarifier.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => start("SITUATION_CLARIFIER")}
          disabled={creating !== null}
          className="text-left p-6 border border-canvas-border rounded-lg hover:border-accent hover:bg-canvas-soft disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <div className="font-semibold">Situation Clarifier</div>
          <div className="mt-2 text-sm text-ink-soft leading-relaxed">
            General-purpose entry. Any leadership issue, situation, or
            question you want to think through.
          </div>
          {creating === "SITUATION_CLARIFIER" && (
            <div className="mt-3 text-xs text-ink-muted">Starting...</div>
          )}
        </button>

        <button
          onClick={() => start("SALES_PLANNING")}
          disabled={creating !== null}
          className="text-left p-6 border border-canvas-border rounded-lg hover:border-accent hover:bg-canvas-soft disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <div className="font-semibold">Sales Planning</div>
          <div className="mt-2 text-sm text-ink-soft leading-relaxed">
            When the issue is clearly sales-driven: pipeline, rep performance,
            territory, comp, accounts, growth.
          </div>
          {creating === "SALES_PLANNING" && (
            <div className="mt-3 text-xs text-ink-muted">Starting...</div>
          )}
        </button>
      </div>

      <div className="mt-8 text-sm text-ink-muted">
        <a href="/dashboard" className="hover:text-ink">
          ← Back to sessions
        </a>
      </div>
    </div>
  );
}
