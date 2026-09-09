"use client";

import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setStatus("sent");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-ink-soft">
        We&apos;ll email you a sign-in link. No password required.
      </p>

      {status === "sent" ? (
        <div className="mt-8 p-4 rounded-md bg-canvas-soft border border-canvas-border">
          <p className="text-sm">
            If <span className="font-medium">{email}</span> is invited, you&apos;ll receive a
            sign-in link within a minute. Check your inbox and spam folder.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-canvas-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              placeholder="you@company.com"
              disabled={status === "sending"}
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending" || !email}
            className="inline-flex items-center px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "sending" ? "Sending..." : "Send sign-in link"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">
              Something went wrong. Try again in a moment.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
