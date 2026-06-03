"use client";
import { useCreateMeeting } from "@/lib/query/meetings";
import { useDrawerStore } from "@/lib/store/drawer";

export function ProfileActions({ memberId }: { memberId: string }) {
  const create = useCreateMeeting();
  const open = useDrawerStore((s) => s.open);
  return (
    <div className="flex shrink-0 gap-2">
      <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Написать</button>
      <button type="button" className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Экспорт</button>
      <button
        type="button"
        disabled={create.isPending}
        className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
        onClick={() => create.mutate(memberId, { onSuccess: (m) => open(m.id) })}
      >
        Начать 1-2-1
      </button>
    </div>
  );
}
