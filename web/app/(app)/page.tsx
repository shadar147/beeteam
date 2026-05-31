import { Topbar } from "@/components/Topbar";

export default function TeamHome() {
  return (
    <>
      <Topbar title="Моя команда" />
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-ink-3">
          <p className="text-[15px] font-medium text-ink-2">Здесь будет ваша команда</p>
          <p className="mt-1 text-[13px]">Список сотрудников и метрики появятся в следующем срезе (TeamList).</p>
        </div>
      </div>
    </>
  );
}
