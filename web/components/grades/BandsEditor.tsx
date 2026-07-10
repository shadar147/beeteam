"use client";
import { formatTenge } from "@/lib/format";
import type { DraftBand } from "./editorTypes";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/\s/g, "")));

export function BandsEditor({
  levels, taxPct, onBand, onTax,
}: {
  levels: DraftBand[];
  taxPct: number;
  onBand: (ord: number, patch: Partial<DraftBand>) => void;
  onTax: (pct: number) => void;
}) {
  const rate = Number.isFinite(taxPct) ? taxPct / 100 : 0;
  const cell = "w-[120px] rounded-md border border-line bg-bg px-2 py-1.5 text-right text-[12.5px] tabular text-ink outline-none focus:border-brand";
  const inputs: [keyof DraftBand, string][] = [
    ["band_low", "мин."], ["band_mid", "медиана"], ["band_high", "макс."],
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
        <label htmlFor="tax" className="text-[13px] font-medium text-ink">Ставка ИПН, %</label>
        <input
          id="tax" aria-label="Ставка ИПН, %" inputMode="decimal" value={Number.isFinite(taxPct) ? String(taxPct) : ""}
          onChange={(e) => onTax(num(e.target.value))}
          className="w-[80px] rounded-md border border-line bg-bg px-2 py-1.5 text-right text-[12.5px] tabular text-ink outline-none focus:border-brand"
        />
        <span className="text-[12px] text-ink-3">«На руки» считается как оклад × (1 − ставка).</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div className="grid items-center gap-3 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: "150px repeat(3, 120px) 1fr" }}>
          <div>Грейд</div><div className="text-right">Мин.</div><div className="text-right">Медиана</div>
          <div className="text-right">Макс.</div><div className="text-right">На руки (медиана)</div>
        </div>
        {levels.map((l) => {
          const netMid = Number.isFinite(l.band_mid) ? Math.round(l.band_mid * (1 - rate)) : 0;
          return (
            <div key={l.ord} className="grid items-center gap-3 border-t border-line-2 px-[18px] py-3"
              style={{ gridTemplateColumns: "150px repeat(3, 120px) 1fr" }}>
              <div className="text-[13px] font-semibold text-ink">{l.code} · {l.name}</div>
              {inputs.map(([field, label]) => (
                <input
                  key={field} aria-label={`${l.code} ${label}`} inputMode="numeric"
                  value={Number.isFinite(l[field] as number) ? String(l[field]) : ""}
                  onChange={(e) => onBand(l.ord, { [field]: num(e.target.value) } as Partial<DraftBand>)}
                  className={cell}
                />
              ))}
              <div className="text-right text-[12.5px] tabular text-ink-2">{formatTenge(netMid)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
