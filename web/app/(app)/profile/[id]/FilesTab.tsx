"use client";
import { useMemo, useState } from "react";
import { SegControl } from "@/components/SegControl";
import { FileRow } from "@/components/FileRow";
import { FileTile } from "@/components/FileTile";
import { FileDropzone } from "@/components/FileDropzone";
import { humanSize, FILE_KINDS } from "@/lib/files";
import { useMemberFiles } from "@/lib/query/profile";
import { downloadFile, useDeleteFile, zipUrl, DemoFileError } from "@/lib/query/files";

export function FilesTab({ memberId }: { memberId: string }) {
  const files = useMemberFiles(memberId);
  const [kind, setKind] = useState("all");
  const [view, setView] = useState("list");
  const del = useDeleteFile(memberId);
  const [toast, setToast] = useState<string | null>(null);

  async function onDownload(id: string) {
    setToast(null);
    try { await downloadFile(id); }
    catch (e) { setToast(e instanceof DemoFileError ? (e as DemoFileError).message : "Не удалось скачать файл"); }
  }
  function onDelete(id: string) {
    if (confirm("Удалить файл?")) del.mutate(id);
  }

  const all = files.data ?? [];
  const shown = useMemo(() => (kind === "all" ? all : all.filter((f) => f.kind === kind)), [all, kind]);
  const totalBytes = all.reduce((s, f) => s + f.size_bytes, 0);
  const last = all[0]?.created_at;

  const kindOptions = FILE_KINDS.map((k) =>
    k.value === "all" ? { value: "all", label: `Все · ${all.length}` } : k,
  );

  if (files.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (files.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить файлы.{" "}
        <button className="underline" onClick={() => files.refetch()}>Повторить</button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegControl options={kindOptions} value={kind} onChange={setKind} />
        <div className="flex items-center gap-2">
          <SegControl
            options={[{ value: "list", label: "Список" }, { value: "grid", label: "Плитки" }]}
            value={view}
            onChange={setView}
          />
          <a href={zipUrl(memberId)} className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Скачать .zip</a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[13px]">
        <div className="rounded-lg border border-line bg-bg-elev p-3">
          <div className="text-[11px] uppercase text-ink-3">Всего</div>
          <div className="text-[16px] font-semibold text-ink tabular">{all.length} файлов</div>
        </div>
        <div className="rounded-lg border border-line bg-bg-elev p-3">
          <div className="text-[11px] uppercase text-ink-3">Объём</div>
          <div className="text-[16px] font-semibold text-ink tabular">{humanSize(totalBytes)}</div>
        </div>
        <div className="rounded-lg border border-line bg-bg-elev p-3">
          <div className="text-[11px] uppercase text-ink-3">Последний</div>
          <div className="text-[16px] font-semibold text-ink tabular">
            {last ? new Date(last).toLocaleDateString("ru-RU") : "—"}
          </div>
        </div>
      </div>

      {toast && <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">{toast}</div>}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3">
          Файлов пока нет
        </div>
      ) : view === "list" ? (
        <div className="rounded-lg border border-line bg-bg-elev">
          {shown.map((f) => <FileRow key={f.id} file={f} onDownload={onDownload} onDelete={onDelete} />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {shown.map((f) => <FileTile key={f.id} file={f} onDownload={onDownload} />)}
        </div>
      )}

      <FileDropzone memberId={memberId} onUploaded={() => files.refetch()} />
    </div>
  );
}
