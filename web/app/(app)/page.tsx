import { getSessionUser, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { TeamListClient } from "./TeamListClient";

export default async function TeamPage() {
  const user = await getSessionUser(); // layout already guaranteed non-null
  if (user && !hasPermission(user, "manage_team")) {
    // HR lands on the queue instead of an empty team screen.
    if (hasPermission(user, "approve_reviews")) redirect("/approvals");
    return <NoAccess />;
  }
  return <TeamListClient teamId={user?.teamId ?? null} />;
}
