import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function Dashboard() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const profileFinalized = user.profile?.status === "FINALIZED";

  const sessions = profileFinalized
    ? await db.session.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
      })
    : [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        {profileFinalized
          ? `Welcome back${user.name ? `, ${user.name}` : ""}.`
          : "Let's set up your Business Context Profile."}
      </h1>

      {!profileFinalized ? (
        <div className="mt-6 p-6 border border-canvas-border rounded-lg">
          <h2 className="font-semibold">Business Context Profile</h2>
          <p className="mt-2 text-ink-soft leading-relaxed">
            Before you can run sessions, Resolve needs to know how your business
            operates. This is a one-time conversation. Every subsequent session
            will read from this profile so it produces business-specific output
            without repeating foundational questions.
          </p>
          <a
            href="/profile"
            className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover"
          >
            Start
          </a>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-3">
            <a
              href="/session/new"
              className="inline-flex items-center px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover"
            >
              New session
            </a>
            <a
              href="/profile"
              className="text-sm text-ink-soft hover:text-ink"
            >
              Review profile
            </a>
          </div>

          <div className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Recent sessions
            </h2>
            {sessions.length === 0 ? (
              <p className="mt-4 text-ink-muted text-sm">
                No sessions yet. Start one to work through an issue.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-canvas-border border-t border-b border-canvas-border">
                {sessions.map((s: {
                  id: string;
                  title: string | null;
                  state: string;
                  laneClassification: string | null;
                  tierClassification: string | null;
                  updatedAt: Date;
                }) => (
                  <li key={s.id}>
                    <a
                      href={`/session/${s.id}`}
                      className="flex items-center justify-between py-4 hover:bg-canvas-soft px-2 -mx-2 rounded"
                    >
                      <div>
                        <div className="font-medium">
                          {s.title || "Untitled session"}
                        </div>
                        <div className="text-xs text-ink-muted mt-1">
                          {s.laneClassification
                            ? `${s.laneClassification} · ${s.tierClassification ?? ""}`
                            : "In progress"}
                          {" · "}
                          {new Date(s.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-xs text-ink-muted uppercase tracking-wide">
                        {s.state.replace(/_/g, " ")}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
