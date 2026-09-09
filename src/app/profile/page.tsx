"use client";

import { useEffect, useRef, useState } from "react";
import ChatSurface, { type ChatMessage } from "@/components/ChatSurface";
import { useRouter } from "next/navigation";

interface ProfileResponse {
  status: "BUILDING" | "FINALIZED" | "REFINING";
  profileText: string | null;
  profileVersion: string | null;
  builderMessages: ChatMessage[];
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const kickoffSentRef = useRef(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile);
  }, [refreshKey]);

  async function onSend(text: string) {
    setThinking(true);
    try {
      const res = await fetch("/api/profile/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface rate-limit or server errors; re-fetch keeps state honest.
        alert(data.error || "Something went wrong. Try again in a moment.");
      }
      setRefreshKey((k) => k + 1);
      if (data.finalized) {
        setTimeout(() => router.push("/dashboard"), 1500);
      }
    } finally {
      setThinking(false);
    }
  }

  // Kick off the conversation on first load if empty
  useEffect(() => {
    if (
      profile &&
      profile.builderMessages.length === 0 &&
      !thinking &&
      !kickoffSentRef.current
    ) {
      kickoffSentRef.current = true;
      // Send a hidden initial message that gets the builder to greet
      fetch("/api/profile/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "I'm ready to build my Business Context Profile.",
        }),
      })
        .then(() => setRefreshKey((k) => k + 1))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-ink-muted">Loading...</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Business Context Profile
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {profile.status === "FINALIZED"
            ? `Profile v${profile.profileVersion} finalized. Review below, or start a new session.`
            : "Answer one question at a time. Aim for the version you'd actually say to a new employee, not the version on the website."}
        </p>
      </div>

      {profile.status === "FINALIZED" && profile.profileText ? (
        <div className="p-6 border border-canvas-border rounded-lg bg-canvas-soft">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-ink">
            {profile.profileText}
          </pre>
        </div>
      ) : (
        <div className="h-[70vh]">
          <ChatSurface
            initialMessages={profile.builderMessages.filter(
              (m) =>
                !(
                  m.role === "user" &&
                  m.content.trim() ===
                    "I'm ready to build my Business Context Profile."
                ),
            )}
            onSend={onSend}
            isThinking={thinking}
            placeholder="Type your answer..."
          />
        </div>
      )}
    </div>
  );
}
