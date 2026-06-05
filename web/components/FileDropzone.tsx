"use client";
import { useRef, useState } from "react";
import { uploadFile } from "@/lib/query/files";

export function FileDropzone({
  memberId, meetingId, onUploaded,
}: { memberId: string; meetingId?: string; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        await uploadFile(f, { memberId, meetingId });
      }
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="cursor-pointer rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[12px] text-ink-3 hover:bg-bg-sunken"
      >
        {busy ? "Загрузка…" : "Перетащите файлы сюда или нажмите, чтобы выбрать"}
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <div className="mt-2 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">{error}</div>}
    </div>
  );
}
