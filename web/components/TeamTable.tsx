import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Avatar } from "./Avatar";
import { Pill } from "./Pill";
import { MoodTrendBars } from "./MoodTrendBars";
import type { components } from "@/lib/api/schema";

type Member = components["schemas"]["MemberRow"];

const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "не назначено";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "сегодня";
  if (days > 0) return `${days} дн. назад`;
  return `через ${-days} дн.`;
}

function statusPill(status: string) {
  if (status === "ok") return <Pill variant="ok" dot>В графике</Pill>;
  if (status === "warn") return <Pill variant="warn" dot>Внимание</Pill>;
  return <Pill variant="miss" dot>Просрочена</Pill>;
}

export function TeamTable({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3">
        Никого не нашлось — попробуйте изменить фильтры.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg-elev">
      <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.3fr_1fr_44px] gap-3 border-b border-line bg-bg-tint px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <div>Сотрудник</div><div>Последняя 1-2-1</div><div>Следующая встреча</div>
        <div>Настроение, тренд</div><div>Статус</div><div />
      </div>
      {members.map((m) => (
        <Link
          key={m.id}
          href={`/profile/${m.id}`}
          className="grid grid-cols-[2fr_1.2fr_1.2fr_1.3fr_1fr_44px] items-center gap-3 border-b border-line-2 px-4 py-3 last:border-b-0 hover:bg-bg-tint"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={m.name} hue={m.hue} size="md" />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{m.name}</div>
              <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <span className="truncate">{m.role}</span>
                {m.tags.map((t) => <Pill key={t} variant="accent" className="h-[18px] text-[10.5px]">{t}</Pill>)}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[13px] tabular">{fmtDate(m.last_meet)}</div>
            <div className="text-[11.5px] text-ink-3">{ago(m.last_meet)}</div>
          </div>
          <div>
            <div className="text-[13px] tabular">{fmtDate(m.next_meet)}</div>
            <div className="text-[11.5px] text-ink-3">{ago(m.next_meet)}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <MoodTrendBars trend={m.mood_trend} />
            <span className="tabular text-[13px] font-semibold">
              {m.mood_trend.length ? m.mood_trend[m.mood_trend.length - 1].toFixed(1) : "—"}
            </span>
          </div>
          <div>{statusPill(m.status)}</div>
          <button
            type="button"
            aria-label="Действия"
            onClick={(e) => { e.preventDefault(); }}
            className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-sunken"
          >
            <MoreHorizontal size={15} />
          </button>
        </Link>
      ))}
    </div>
  );
}
