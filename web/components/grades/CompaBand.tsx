export function CompaBand({ compa, gradeCode }: { compa: number; gradeCode: string }) {
  const pct = Math.round(compa * 100);
  const note =
    compa < 0.4
      ? "В нижней части полосы — есть пространство для роста внутри грейда."
      : compa < 0.66
        ? "Около медианы грейда — соответствует уровню."
        : "В верхней части полосы — близко к потолку грейда, основной рост через повышение.";
  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="text-[13px] font-semibold text-ink">Позиция в полосе</div>
      <div className="mb-5 text-[12px] text-ink-3">{gradeCode} · вид лида, без точных окладов</div>
      <div className="relative flex h-7 items-center">
        <div className="absolute h-2 w-full rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand" />
        <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: "0%" }} />
        <div className="absolute h-[18px] w-0.5 rounded bg-brand-strong" style={{ left: "50%" }} />
        <div className="absolute h-3.5 w-0.5 rounded bg-ink-4" style={{ left: "calc(100% - 2px)" }} />
        <div
          data-testid="compa-marker"
          className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-bg-elev bg-ink shadow"
          style={{ left: `${pct}%` }}
          title="позиция сотрудника"
        />
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{note}</p>
    </div>
  );
}
