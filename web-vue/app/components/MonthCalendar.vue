<script lang="ts">
export type CalMeeting = { id: string; date: string; state: string };
</script>

<script setup lang="ts">
import { computed } from "vue";
import { cn } from "~/lib/utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const CHIP: Record<string, { glyph: string; cls: string }> = {
  done: { glyph: "✓", cls: "bg-ok-soft text-ok" },
  planned: { glyph: "○", cls: "bg-info-soft text-info" },
  miss: { glyph: "✕", cls: "bg-miss-soft text-miss" },
};

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const props = defineProps<{
  month: Date;
  today: Date;
  meetings: CalMeeting[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ select: [id: string]; monthChange: [next: Date] }>();

const year = computed(() => props.month.getFullYear());
const m = computed(() => props.month.getMonth());

const cells = computed(() => {
  const first = new Date(year.value, m.value, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-based offset (JS getDay: 0=Sun)
  const start = new Date(year.value, m.value, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const mtg = props.meetings.find((x) => sameDay(new Date(x.date), d));
    return {
      d,
      mtg,
      inMonth: d.getMonth() === m.value,
      isToday: sameDay(d, props.today),
      chip: mtg ? CHIP[mtg.state] : null,
    };
  });
});
</script>

<template>
  <div class="rounded-lg border border-line bg-bg-elev p-3">
    <div class="mb-2 flex items-center justify-between">
      <span class="tabular text-[14px] font-semibold text-ink">
        {{ MONTHS[m] }} {{ year }}
      </span>
      <div class="flex items-center gap-1">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          class="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
          @click="emit('monthChange', new Date(year, m - 1, 1))"
        >
          ‹
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-bg-tint"
          @click="emit('monthChange', new Date(today.getFullYear(), today.getMonth(), 1))"
        >
          Сегодня
        </button>
        <button
          type="button"
          aria-label="Следующий месяц"
          class="rounded px-2 py-1 text-ink-3 hover:bg-bg-tint"
          @click="emit('monthChange', new Date(year, m + 1, 1))"
        >
          ›
        </button>
      </div>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
      <div v-for="w in WEEKDAYS" :key="w">{{ w }}</div>
    </div>
    <div role="grid" class="mt-1 grid grid-cols-7 gap-1">
      <button
        v-for="(cell, i) in cells"
        :key="i"
        role="gridcell"
        type="button"
        :disabled="!cell.mtg"
        :class="cn(
          'relative flex h-9 items-center justify-center rounded text-[12px] tabular',
          cell.inMonth ? 'text-ink-2' : 'text-ink-4',
          cell.isToday && 'ring-1 ring-brand',
          cell.mtg && cell.mtg.id === selectedId && 'bg-brand-soft',
          cell.mtg ? 'hover:bg-bg-tint' : 'cursor-default',
        )"
        @click="cell.mtg && emit('select', cell.mtg.id)"
      >
        {{ cell.d.getDate() }}
        <span
          v-if="cell.chip"
          :class="cn(
            'absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full text-[8px] leading-3',
            cell.chip.cls,
          )"
        >
          {{ cell.chip.glyph }}
        </span>
      </button>
    </div>
  </div>
</template>
