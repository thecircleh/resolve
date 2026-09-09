// Admin authorization.
//
// A user is an administrator if either:
//   - their User row has isAdmin = true, or
//   - their email appears in the ADMIN_EMAILS env var (comma-separated).
//
// The env var route is the bootstrap: it lets you grant yourself admin
// before there is any way to set the flag in the database, and it is what
// allows the first admin to sign in at all (see the auth request route,
// which auto-provisions ADMIN_EMAILS addresses so the very first sign-in
// on an empty database can succeed).

import { requireUser } from "./auth";

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase().trim());
}

export interface AdminUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

// Returns the signed-in admin, or null if the caller is not one.
export async function requireAdmin(): Promise<AdminUser | null> {
  const user = await requireUser();
  if (!user) return null;
  if (!user.isAdmin && !isAdminEmail(user.email)) return null;
  return { id: user.id, email: user.email, isAdmin: user.isAdmin };
}
