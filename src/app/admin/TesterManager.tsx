"use client";

import { useCallback, useEffect, useState } from "react";

interface TesterUser {
  id: string;
  email: string;
  isAdmin: boolean;
  adminViaEnv: boolean;
  createdAt: string;
  invitedAt: string | null;
  invitedBy: string | null;
  lastLoginAt: string | null;
  revoked: boolean;
  profileStatus: string | null;
  sessionCount: number;
}

interface UsersResponse {
  users: TesterUser[];
  inviteTtlDays: number;
  legacyAllowlistCount: number;
}

type Notice = { kind: "ok" | "warn" | "error"; text: string } | null;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TesterManager() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;

    setBusy("invite");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setNotice({
          kind: "error",
          text: body.error || "Could not add that person.",
        });
        return;
      }
      if (!body.emailSent) {
        setNotice({
          kind: "warn",
          text: `${value} was added, but the invite email failed to send (${body.emailError || "unknown error"}). They can still sign in from the login page. Check your Resend settings.`,
        });
      } else if (body.wasRevoked) {
        setNotice({ kind: "ok", text: `${value} was restored and re-invited.` });
      } else if (body.alreadyExisted) {
        setNotice({
          kind: "ok",
          text: `${value} was already on the list — a fresh invite was sent.`,
        });
      } else {
        setNotice({ kind: "ok", text: `Invite sent to ${value}.` });
      }
      setEmail("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function act(userId: string, action: "resend" | "revoke" | "restore") {
    if (
      action === "revoke" &&
      !confirm(
        "Revoke access for this person? Their sessions and profile are kept, but they will not be able to sign in.",
      )
    ) {
      return;
    }

    setBusy(userId);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setNotice({ kind: "error", text: body.error || "That did not work." });
        return;
      }
      if (action === "resend") {
        setNotice(
          body.emailSent
            ? { kind: "ok", text: "Invite resent." }
            : {
                kind: "warn",
                text: `Invite email failed to send (${body.emailError || "unknown error"}).`,
              },
        );
      } else {
        setNotice({
          kind: "ok",
          text: action === "revoke" ? "Access revoked." : "Access restored.",
        });
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function importLegacy() {
    setBusy("import");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users/import", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", text: body.error || "Import failed." });
        return;
      }
      setNotice({
        kind: "ok",
        text: `Imported ${body.imported} address${body.imported === 1 ? "" : "es"} from BETA_ALLOWLIST. ${body.skipped} already existed. You can now remove BETA_ALLOWLIST from Vercel.`,
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <div className="mt-8 text-sm text-ink-muted">Loading testers...</div>;
  }

  const active = data.users.filter((u) => !u.revoked).length;

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Beta testers
        </h2>
        <span className="text-xs text-ink-muted">
          {active} active · {data.users.length} total
        </span>
      </div>

      <form onSubmit={invite} className="mt-3 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="flex-1 px-3 py-2 text-sm border border-canvas-border rounded-md focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
        <button
          type="submit"
          disabled={busy === "invite"}
          className="px-4 py-2 text-sm font-medium rounded-md bg-ink text-white disabled:opacity-50"
        >
          {busy === "invite" ? "Sending..." : "Add & send invite"}
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-muted">
        Adding someone creates their account and emails them a sign-in link
        good for {data.inviteTtlDays} days.
      </p>

      {notice && (
        <div
          className={`mt-3 px-3 py-2 text-sm rounded-md border ${
            notice.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : notice.kind === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.text}
        </div>
      )}

      {data.legacyAllowlistCount > 0 && (
        <div className="mt-3 px-3 py-3 text-sm rounded-md border border-canvas-border">
          <div className="font-medium">
            BETA_ALLOWLIST still has {data.legacyAllowlistCount} address
            {data.legacyAllowlistCount === 1 ? "" : "es"}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            That env var no longer controls access. Import it once so nobody
            on it is locked out, then delete it from Vercel.
          </p>
          <button
            onClick={importLegacy}
            disabled={busy === "import"}
            className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md border border-canvas-border disabled:opacity-50"
          >
            {busy === "import" ? "Importing..." : "Import into the list"}
          </button>
        </div>
      )}

      <div className="mt-3 border border-canvas-border rounded-md divide-y divide-canvas-border">
        {data.users.length === 0 ? (
          <div className="p-4 text-sm text-ink-muted">
            No testers yet. Add one above.
          </div>
        ) : (
          data.users.map((u) => (
            <div
              key={u.id}
              className="p-4 text-sm flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium truncate ${u.revoked ? "line-through text-ink-muted" : ""}`}
                  >
                    {u.email}
                  </span>
                  {u.isAdmin && (
                    <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-ink/10 text-ink-soft">
                      Admin
                    </span>
                  )}
                  {u.revoked && (
                    <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-red-100 text-red-700">
                      Revoked
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {u.lastLoginAt
                    ? `Last signed in ${formatDate(u.lastLoginAt)}`
                    : "Never signed in"}
                  {" · "}
                  {u.sessionCount} session{u.sessionCount === 1 ? "" : "s"}
                  {" · "}
                  profile {(u.profileStatus || "none").toLowerCase()}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                {u.revoked ? (
                  <button
                    onClick={() => act(u.id, "restore")}
                    disabled={busy === u.id}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-canvas-border disabled:opacity-50"
                  >
                    Restore
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => act(u.id, "resend")}
                      disabled={busy === u.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-canvas-border disabled:opacity-50"
                    >
                      Resend invite
                    </button>
                    <button
                      onClick={() => act(u.id, "revoke")}
                      disabled={busy === u.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-canvas-border text-red-700 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {data.users.some((u) => u.adminViaEnv) && (
        <p className="mt-2 text-xs text-ink-muted">
          Accounts marked Admin via ADMIN_EMAILS keep that access as long as
          their address stays in the env var.
        </p>
      )}
    </section>
  );
}
