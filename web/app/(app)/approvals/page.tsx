import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";
import { ApprovalsClient } from "@/components/approvals/ApprovalsClient";

export default async function ApprovalsPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  if (user && !hasPermission(user, "approve_reviews")) return <NoAccess />;
  return <ApprovalsClient />;
}
