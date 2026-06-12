import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
import { CalendarClient } from "@/components/calendar/CalendarClient";

export default async function CalendarPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  if (user && !hasPermission(user, "manage_team")) return <NoAccess />;
  return <CalendarClient teamId={user?.teamId ?? null} />;
}
