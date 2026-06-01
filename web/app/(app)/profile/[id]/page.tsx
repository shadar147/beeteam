import { Topbar } from "@/components/Topbar";

export default function ProfilePlaceholder() {
  return (
    <>
      <Topbar title="Профиль сотрудника" />
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-ink-3">
          <p className="text-[15px] font-medium text-ink-2">Профиль появится в следующем срезе</p>
          <p className="mt-1 text-[13px]">История 1-2-1, цели и файлы будут здесь.</p>
        </div>
      </div>
    </>
  );
}
