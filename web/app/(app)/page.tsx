import { getSessionUser } from "@/lib/auth";
import { TeamListClient } from "./TeamListClient";

export default async function TeamPage() {
  const user = await getSessionUser(); // layout already guaranteed non-null
  return <TeamListClient teamId={user?.teamId ?? null} />;
}
