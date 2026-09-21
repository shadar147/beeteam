/** "1 300 000 ₸" — rounded, ru-RU grouped, with the tenge sign. */
export function formatTenge(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("ru-RU")} ₸`;
}
