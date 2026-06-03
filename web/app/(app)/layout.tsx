import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { MeetingDrawerHost } from "@/components/MeetingDrawerHost";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Cookie present but token invalid (expired / user gone) → clear it then bounce
  // to /login. Redirecting straight to /login would loop: the middleware sees the
  // stale cookie and sends us back here. /api/auth/logout (exempt from the matcher)
  // clears the cookie first.
  if (!user) redirect("/api/auth/logout");

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0">{children}</main>
      <MeetingDrawerHost />
    </div>
  );
}
