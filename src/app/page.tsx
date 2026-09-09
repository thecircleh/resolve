import { getSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Landing() {
  const userId = await getSessionUserId();
  if (userId) redirect("/dashboard");

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Structured thinking for operating decisions.
      </h1>
      <p className="mt-4 text-lg text-ink-soft leading-relaxed">
        Bring a leadership situation, problem, or question. Resolve helps you
        move from unclear to decisive with a defined method and a
        decision-grade output you can act on or share.
      </p>
      <div className="mt-8">
        <a
          href="/login"
          className="inline-flex items-center px-5 py-2.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover"
        >
          Sign in
        </a>
      </div>
      <p className="mt-6 text-sm text-ink-muted">
        Access is limited to invited beta testers.
      </p>
    </div>
  );
}
