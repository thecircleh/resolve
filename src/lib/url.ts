// Resolves the public base URL of the deployment.
//
// Prefers NEXT_PUBLIC_APP_URL when set, since that is the canonical domain.
// Falls back to the forwarded host so preview deployments still produce
// working links without per-deployment configuration.

export function appUrlFrom(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const forwardedHost =
    req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (forwardedHost) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${forwardedHost}`;
  }

  return "http://localhost:3000";
}
