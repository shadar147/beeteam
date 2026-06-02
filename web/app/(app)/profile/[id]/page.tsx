import Link from "next/link";
import { HistoryTab } from "./HistoryTab";
import { GoalsTab } from "./GoalsTab";
import { FilesTab } from "./FilesTab";

const TABS = [
  { key: "history", label: "История 1-2-1" },
  { key: "goals", label: "Цели и развитие" },
  { key: "files", label: "Файлы" },
];

export default function ProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
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
      ) : tab === "files" ? (
        <FilesTab memberId={params.id} />
      ) : (
        <HistoryTab memberId={params.id} />
      )}
    </div>
  );
}
