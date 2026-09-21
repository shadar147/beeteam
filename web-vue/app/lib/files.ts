/** Human-readable byte size with Russian units, rounded to whole units. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} МБ`;
  return `${Math.round(mb / 1024)} ГБ`;
}

export const FILE_KINDS = [
  { value: "all", label: "Все" },
  { value: "doc", label: "Документы" },
  { value: "img", label: "Изображения" },
  { value: "video", label: "Видео" },
  { value: "pdf", label: "PDF" },
  { value: "sheet", label: "Таблицы" },
] as const;
