/** Client-safe permission helpers (no next/headers). */

export type SessionUser = {
  id: string; name: string; email: string; role: string;
  teamId: string | null;
  permissions: string[];
};

export function hasPermission(user: Pick<SessionUser, "permissions">, p: string): boolean {
  return user.permissions.includes(p);
}
