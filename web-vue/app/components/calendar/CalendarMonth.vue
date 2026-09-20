<script setup lang="ts">
import { computed } from "vue";
import { cn } from "~/lib/utils";
import { RU_DOW, sameDay, shortName, STATE_META } from "~/lib/calendar";
import type { CalendarMeeting } from "~/lib/query/calendar";

const props = defineProps<{ month: Date; today: Date; meetings: CalendarMeeting[] }>();
const emit = defineEmits<{ select: [id: string]; openDay: [day: Date] }>();

const cells = computed(() => {
  const year = props.month.getFullYear();
  const m = props.month.getMonth();
  const first = new Date(year, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, m, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dayMtgs = props.meetings.filter((x) => sameDay(new Date(x.date), d));
    const shown = dayMtgs.slice(0, 3);
    return { d, dayMtgs, shown, extra: dayMtgs.length - shown.length, inMonth: d.getMonth() === m };
  });
});
</script>

<template>
  <div class="rounded-lg border border-line bg-bg-elev p-3">
    <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
      <div v-for="w in RU_DOW" :key="w">{{ w }}</div>
    </div>
    <div class="mt-1 grid grid-cols-7 gap-1">
      <div
        v-for="({ d, dayMtgs, shown, extra, inMonth }, i) in cells"
        :key="i"
        :class="cn(
          'min-h-[84px] rounded-md border p-1',
          inMonth ? 'border-line-2 bg-bg-elev' : 'border-transparent bg-bg-tint/40',
          sameDay(d, today) && 'ring-1 ring-brand',
        )"
      >
        <button
          v-if="dayMtgs.length > 0"
          type="button"
          :class="cn('mb-0.5 w-full text-right text-[11px] tabular hover:text-ink cursor-pointer', inMonth ? 'text-ink-3' : 'text-ink-4')"
          @click="emit('openDay', d)"
        >
          {{ d.getDate() }}
        </button>
        <div v-else :class="cn('mb-0.5 text-right text-[11px] tabular', inMonth ? 'text-ink-3' : 'text-ink-4')">{{ d.getDate() }}</div>
        <div class="space-y-0.5">
          <button
            v-for="mt in shown"
            :key="mt.id"
            type="button"
            class="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-ink-2 hover:bg-bg-tint"
            @click="emit('select', mt.id)"
          >
            <span :class="cn('h-1.5 w-1.5 shrink-0 rounded-full', STATE_META[mt.state]?.dot ?? 'bg-ink-4')" />
            <span class="truncate">{{ shortName(mt.member_name) }}</span>
          </button>
          <button
            v-if="extra > 0"
            type="button"
            class="px-1 text-[10px] text-ink-3 hover:text-ink"
            @click="emit('openDay', d)"
          >
            +{{ extra }} ещё
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
