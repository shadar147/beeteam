<script setup lang="ts">
import { computed } from "vue";
import Avatar from "~/components/Avatar.vue";
import Pill from "~/components/Pill.vue";
import { RU_MONTHS, STATE_META } from "~/lib/calendar";
import type { CalendarMeeting } from "~/lib/query/calendar";

const PILL: Record<string, "info" | "ok" | "miss"> = { planned: "info", done: "ok", miss: "miss" };

const props = defineProps<{ meetings: CalendarMeeting[] }>();
const emit = defineEmits<{ select: [id: string] }>();

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const groups = computed(() => {
  const sorted = [...props.meetings].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const out: { key: string; label: string; items: CalendarMeeting[] }[] = [];
  for (const mt of sorted) {
    const key = dayKey(mt.date);
    let g = out.find((x) => x.key === key);
    if (!g) { g = { key, label: dayLabel(mt.date), items: [] }; out.push(g); }
    g.items.push(mt);
  }
  return out;
});
</script>

<template>
  <div
    v-if="meetings.length === 0"
    class="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3"
  >
    Встреч нет
  </div>
  <div v-else class="space-y-4">
    <div v-for="g in groups" :key="g.key">
      <div class="mb-1 text-[12px] font-medium text-ink-3 tabular">{{ g.label }}</div>
      <div class="rounded-lg border border-line bg-bg-elev">
        <button
          v-for="mt in g.items"
          :key="mt.id"
          type="button"
          class="flex w-full items-center gap-3 border-b border-line-2 px-3 py-2.5 text-left last:border-b-0 hover:bg-bg-tint"
          @click="emit('select', mt.id)"
        >
          <span class="w-12 shrink-0 text-[12px] text-ink-3 tabular">{{ hhmm(mt.date) }}</span>
          <Avatar :name="mt.member_name" :hue="mt.hue" size="sm" />
          <span class="flex-1 truncate text-[13px] text-ink">{{ mt.member_name }}</span>
          <Pill :variant="PILL[mt.state] ?? 'default'" dot>{{ STATE_META[mt.state]?.label ?? mt.state }}</Pill>
        </button>
      </div>
    </div>
  </div>
</template>
