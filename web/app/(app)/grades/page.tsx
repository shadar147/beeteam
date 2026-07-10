import { getSessionUser, hasPermission } from "@/lib/auth";
import { GradesClient } from "@/components/grades/GradesClient";

export default async function GradesPage() {
  const user = await getSessionUser(); // layout guarantees non-null
  return (
    <GradesClient
      canEdit={user ? hasPermission(user, "edit_framework") : false}
      canEditBands={user ? hasPermission(user, "edit_salary_bands") : false}
    />
  );
}
