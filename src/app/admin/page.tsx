"use client";

import { useEffect, useState } from "react";
import TesterManager from "./TesterManager";

interface Stats {
  users: number;
  profilesFinalized: number;
  sessionsTotal: number;
  sessionsThisWeek: number;
  messagesToday: number;
  errorsToday: number;
  estSpendTodayUsd: number;
  estSpendWeekUsd: number;
  recentErrors: Array<{ context: string; message: string; createdAt: string }>;
  recentSessions: Array<{
    id: string;
    title: string | null;
    state: string;
    lane: string | null;
    tier: string | null;
    updatedAt: string;
    userEmail: string;
  }>;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/admin/stats").then(async (r) => {
      if (r.status === 403 || r.status === 401) {
        setForbidden(true);
        return;
      }
      if (r.ok) setStats(await r.json());
    });
  }, []);

  if (forbidden) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-ink-muted">
          This page is only available to program administrators.
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-ink-muted">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Beta Program Dashboard</h1>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Users" value={stats.users} />
        <Stat label="Profiles finalized" value={stats.profilesFinalized} />
        <Stat label="Sessions total" value={stats.sessionsTotal} />
        <Stat label="Sessions this week" value={stats.sessionsThisWeek} />
        <Stat label="Messages today" value={stats.messagesToday} />
        <Stat label="Errors today" value={stats.errorsToday} alert={stats.errorsToday > 0} />
        <Stat label="Est. spend today" value={`$${stats.estSpendTodayUsd.toFixed(2)}`} />
        <Stat label="Est. spend 7 days" value={`$${stats.estSpendWeekUsd.toFixed(2)}`} />
      </div>

      <TesterManager />

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Recent sessions
      </h2>
      <div className="mt-3 border border-canvas-border rounded-md divide-y divide-canvas-border">
        {stats.recentSessions.length === 0 ? (
          <div className="p-4 text-sm text-ink-muted">No sessions yet.</div>
        ) : (
          stats.recentSessions.map((s) => (
            <div key={s.id} className="p-4 text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">{s.title || "Untitled"}</div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {s.userEmail} · {s.lane || "—"} · {s.tier || "—"}
                </div>
              </div>
              <div className="text-xs text-ink-muted uppercase tracking-wide">
                {s.state.replace(/_/g, " ")}
              </div>
            </div>
          ))
        )}
      </div>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Recent errors
      </h2>
      <div className="mt-3 border border-canvas-border rounded-md divide-y divide-canvas-border">
        {stats.recentErrors.length === 0 ? (
          <div className="p-4 text-sm text-ink-muted">No errors logged. Good sign.</div>
        ) : (
          stats.recentErrors.map((e, i) => (
            <div key={i} className="p-4 text-sm">
              <div className="text-xs text-ink-muted">
                {new Date(e.createdAt).toLocaleString()} · {e.context}
              </div>
              <div className="mt-1 font-mono text-xs text-red-700 break-all">
                {e.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  alert,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
}) {
  return (
    <div className="p-4 border border-canvas-border rounded-md">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${alert ? "text-red-600" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}
