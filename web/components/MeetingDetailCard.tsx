"use client";
import { Pill } from "./Pill";
import { NoteBlock } from "./NoteBlock";
import type { MeetingDetail } from "@/lib/query/profile";
import { useDrawerStore } from "@/lib/store/drawer";
import { useDeleteMeeting } from "@/lib/query/meetings";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function MeetingDetailCard({ meeting }: { meeting: MeetingDetail }) {
  const open = useDrawerStore((s) => s.open);
  const del = useDeleteMeeting();
  const dateStr = fmtDate(meeting.date);

  if (meeting.state !== "done") {
    return (
      <div className="rounded-lg border border-line bg-bg-elev p-4">
        <Pill variant="info" dot>Запланирована</Pill>
        <div className="mt-2 text-[14px] font-medium text-ink tabular">{dateStr}</div>
        <p className="mt-1 text-[13px] text-ink-3">Встреча ещё не проведена.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
            onClick={() => open(meeting.id)}>Провести сейчас</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
            onClick={() => open(meeting.id)}>Перенести</button>
          <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
            onClick={() => { if (confirm("Удалить встречу?")) del.mutate({ id: meeting.id, memberId: meeting.member_id }); }}>
            Отменить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-bg-elev p-4">
      <div className="flex items-center justify-between">
        <Pill variant="ok" dot>Завершена</Pill>
        <span className="text-[12px] text-ink-3 tabular">{dateStr} · {meeting.duration_min} мин</span>
      </div>
      <button type="button" className="mt-3 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
        onClick={() => open(meeting.id)}>Редактировать</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-line-2 bg-bg-tint p-3">
          <div className="text-[11px] uppercase text-ink-3">Настроение</div>
          <div className="text-[15px] text-ink tabular">{meeting.mood ?? "—"} {meeting.mood_score ?? ""}</div>
        </div>
        <div className="rounded-md border border-line-2 bg-bg-tint p-3">
          <div className="text-[11px] uppercase text-ink-3">Отношения</div>
          <div className="text-[13px] text-ink-2">{meeting.relationships ?? "—"}</div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <NoteBlock label="Блокеры">{meeting.blockers ?? ""}</NoteBlock>
        <NoteBlock label="Цели">{meeting.goals ?? ""}</NoteBlock>
        <NoteBlock label="Фидбек к сотруднику">{meeting.feedback_to ?? ""}</NoteBlock>
        <NoteBlock label="Фидбек от сотрудника">{meeting.feedback_from ?? ""}</NoteBlock>
        {meeting.development.length > 0 && (
          <div className="rounded-md border border-line-2 bg-bg-tint p-3">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Развитие</div>
            <ul className="list-disc pl-4 text-[13px] text-ink-2">
              {meeting.development.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
