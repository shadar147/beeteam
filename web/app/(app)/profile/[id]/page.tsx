import Link from "next/link";
import { HistoryTab } from "./HistoryTab";
import { GoalsTab } from "./GoalsTab";
import { FilesTab } from "./FilesTab";
import { GradeTab } from "./GradeTab";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { NoAccess } from "@/components/NoAccess";

const TABS = [
  { key: "history", label: "История 1-2-1" },
  { key: "goals", label: "Цели и развитие" },
  { key: "grade", label: "Грейд" },
  { key: "files", label: "Файлы" },
];

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await getSessionUser();
  if (user && !hasPermission(user, "manage_team")) return <NoAccess />;

  const tab = searchParams.tab ?? "history";

  return (
    <div className="p-6">
      <nav className="-mt-2 mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/profile/${params.id}?tab=${t.key}`}
            data-active={tab === t.key}
            className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-[13px] text-ink-2 hover:text-ink data-[active=true]:border-brand data-[active=true]:font-medium data-[active=true]:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "goals" ? (
        <GoalsTab memberId={params.id} />
      ) : tab === "grade" ? (
        <GradeTab memberId={params.id} />
      ) : tab === "files" ? (
        <FilesTab memberId={params.id} />
      ) : (
        <HistoryTab memberId={params.id} />
      )}
    </div>
  );
}
