<script setup lang="ts">
import { computed } from "vue";
import Pill from "~/components/Pill.vue";
import NoteBlock from "~/components/NoteBlock.vue";
import type { MeetingDetail } from "~/lib/query/profile";
import { useDrawerStore } from "~/stores/drawer";
import { useDeleteMeeting } from "~/lib/query/meetings";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

const props = defineProps<{ meeting: MeetingDetail }>();
const drawer = useDrawerStore();
const del = useDeleteMeeting();
const dateStr = computed(() => fmtDate(props.meeting.date));

function cancel() {
  if (confirm("Удалить встречу?")) del.mutate({ id: props.meeting.id, memberId: props.meeting.member_id });
}
</script>

<template>
  <div v-if="meeting.state !== 'done'" class="rounded-lg border border-line bg-bg-elev p-4">
    <Pill variant="info" dot>Запланирована</Pill>
    <div class="mt-2 text-[14px] font-medium text-ink tabular">{{ dateStr }}</div>
    <p class="mt-1 text-[13px] text-ink-3">Встреча ещё не проведена.</p>
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
        @click="drawer.open(meeting.id)"
      >Провести сейчас</button>
      <button
        type="button"
        class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
        @click="drawer.open(meeting.id)"
      >Перенести</button>
      <button
        type="button"
        class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
        @click="cancel"
      >
        Отменить
      </button>
    </div>
  </div>

  <div v-else class="rounded-lg border border-line bg-bg-elev p-4">
    <div class="flex items-center justify-between">
      <Pill variant="ok" dot>Завершена</Pill>
      <span class="text-[12px] text-ink-3 tabular">{{ dateStr }} · {{ meeting.duration_min }} мин</span>
    </div>
    <button
      type="button"
      class="mt-3 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
      @click="drawer.open(meeting.id)"
    >Редактировать</button>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="rounded-md border border-line-2 bg-bg-tint p-3">
        <div class="text-[11px] uppercase text-ink-3">Настроение</div>
        <div class="text-[15px] text-ink tabular">{{ meeting.mood ?? "—" }} {{ meeting.mood_score ?? "" }}</div>
      </div>
      <div class="rounded-md border border-line-2 bg-bg-tint p-3">
        <div class="text-[11px] uppercase text-ink-3">Отношения</div>
        <div class="text-[13px] text-ink-2">{{ meeting.relationships ?? "—" }}</div>
      </div>
    </div>
    <div class="mt-3 space-y-2">
      <NoteBlock label="Блокеры">{{ meeting.blockers ?? "" }}</NoteBlock>
      <NoteBlock label="Цели">{{ meeting.goals ?? "" }}</NoteBlock>
      <NoteBlock label="Фидбек к сотруднику">{{ meeting.feedback_to ?? "" }}</NoteBlock>
      <NoteBlock label="Фидбек от сотрудника">{{ meeting.feedback_from ?? "" }}</NoteBlock>
      <div v-if="meeting.development.length > 0" class="rounded-md border border-line-2 bg-bg-tint p-3">
        <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Развитие</div>
        <ul class="list-disc pl-4 text-[13px] text-ink-2">
          <li v-for="(d, i) in meeting.development" :key="i">{{ d }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
