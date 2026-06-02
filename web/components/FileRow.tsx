import { FileGlyph } from "./FileGlyph";
import { humanSize } from "@/lib/files";
import type { FileMeta } from "@/lib/query/profile";

export function FileRow({ file }: { file: FileMeta }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-2 px-3 py-2.5 last:border-b-0 hover:bg-bg-tint">
      <FileGlyph kind={file.kind} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{file.name}</div>
        <div className="text-[11px] text-ink-3">
          {file.meeting_label ? <><span>{file.meeting_label}</span> · </> : null}
          {file.uploaded_by}
        </div>
      </div>
      <span className="text-[12px] text-ink-3 tabular">{humanSize(file.size_bytes)}</span>
      <button type="button" aria-label="Скачать" className="rounded px-2 py-1 text-ink-3 hover:bg-bg-sunken">↓</button>
    </div>
  );
}
