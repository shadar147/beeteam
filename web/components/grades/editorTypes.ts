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
