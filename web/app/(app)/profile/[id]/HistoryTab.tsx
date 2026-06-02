"use client";
import { useState } from "react";
import { MonthCalendar, type CalMeeting } from "@/components/MonthCalendar";
import { MeetingDetailCard } from "@/components/MeetingDetailCard";
import { Feed } from "@/components/Feed";
import { useMemberMeetings, useMeeting } from "@/lib/query/profile";

export function HistoryTab({ memberId }: { memberId: string }) {
  const meetings = useMemberMeetings(memberId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const detail = useMeeting(selectedId);

  if (meetings.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (meetings.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить встречи.{" "}
        <button className="underline" onClick={() => meetings.refetch()}>Повторить</button>
      </div>
    );

  const items = meetings.data ?? [];
  const calMeetings: CalMeeting[] = items.map((m) => ({ id: m.id, date: m.date, state: m.state }));

  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-6">
      <div className="space-y-4">
        <MonthCalendar
          month={month}
          today={new Date()}
          meetings={calMeetings}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMonthChange={setMonth}
        />
        {selectedId && detail.data ? (
          <MeetingDetailCard meeting={detail.data} />
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[13px] text-ink-3">
            Выберите встречу в календаре или ленте
          </div>
        )}
      </div>
      <Feed items={items} activeId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
