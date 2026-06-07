import { getSessionUser } from "@/lib/auth";
import { CalendarClient } from "@/components/calendar/CalendarClient";

export default async function CalendarPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  return <CalendarClient teamId={user?.teamId ?? null} />;
}
