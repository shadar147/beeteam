export type DraftCell = { level: number; text: string | null; required: boolean };
export type DraftBlock = { id: string | null; key: string; name: string; cells: DraftCell[] };
export type DraftLevel = { ord: number; code: string; name: string; exp: string; autonomy: string; scope: string };
export type Draft = {
  discId: string;
  label: string;
  icon: string;
  description: string;
  blocks: DraftBlock[];
  levels: DraftLevel[];
  levelsDirty: boolean;
};

/** Empty 7-cell array (level 1..7, required true, no text) for a fresh block. */
export function emptyCells(): DraftCell[] {
  return Array.from({ length: 7 }, (_, i) => ({ level: i + 1, text: null, required: true }));
}

export type DraftBand = { ord: number; code: string; name: string; band_low: number; band_mid: number; band_high: number };
export type BandsDraft = { taxPct: number; levels: DraftBand[] };

/** True when every band satisfies 0 < low ≤ mid ≤ high and the rate is 0..99. */
export function bandsDraftValid(d: BandsDraft): boolean {
  const rateOk = Number.isFinite(d.taxPct) && d.taxPct >= 0 && d.taxPct <= 99;
  const bandsOk = d.levels.every(
    (l) => [l.band_low, l.band_mid, l.band_high].every(Number.isFinite)
      && l.band_low > 0 && l.band_low <= l.band_mid && l.band_mid <= l.band_high,
  );
  return rateOk && bandsOk;
}
