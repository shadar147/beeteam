import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
import { TeamsAdminClient } from "@/components/admin/TeamsAdminClient";

export default async function AdminTeamsPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  if (user && !hasPermission(user, "manage_workspace")) return <NoAccess />;
  return <TeamsAdminClient />;
}
