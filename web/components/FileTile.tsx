import { FileGlyph } from "./FileGlyph";
import { humanSize } from "@/lib/files";
import type { FileMeta } from "@/lib/query/profile";

export function FileTile({ file, onDownload }: { file: FileMeta; onDownload?: (id: string) => void }) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-lg border border-line bg-bg-elev p-4 text-center hover:bg-bg-tint${onDownload ? " cursor-pointer" : ""}`}
      onClick={onDownload ? () => onDownload(file.id) : undefined}
    >
      <FileGlyph kind={file.kind} size={48} />
      <div className="w-full truncate text-[12px] font-medium text-ink">{file.name}</div>
      <div className="text-[11px] text-ink-3 tabular">{humanSize(file.size_bytes)}</div>
    </div>
  );
}
