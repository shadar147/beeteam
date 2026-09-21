<script setup lang="ts">
import { computed } from "vue";
import { cn } from "~/lib/utils";
import Avatar from "~/components/Avatar.vue";
import { RU_DOW, RU_MONTHS, STATE_META } from "~/lib/calendar";
import type { CalendarMeeting } from "~/lib/query/calendar";

const props = defineProps<{ meetings: CalendarMeeting[]; today: Date }>();
const emit = defineEmits<{ select: [id: string] }>();

const LEGEND = ["planned", "done", "miss"] as const;

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const upcoming = computed(() => {
  const { today } = props;
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21);
  return props.meetings
    .filter((m) => m.state === "planned" && new Date(m.date) >= today && new Date(m.date) <= horizon)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 6);
});

// Week load: count meetings per weekday (Mon..Sun) within the current displayed set.
const loads = computed(() => {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const m of props.meetings) {
    const idx = (new Date(m.date).getDay() + 6) % 7;
    out[idx]! += 1;
  }
  return out;
});
const maxLoad = computed(() => Math.max(1, ...loads.value));
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-line bg-bg-elev p-3">
      <h3 class="mb-2 text-[13px] font-semibold text-ink">Ближайшие встречи</h3>
      <p v-if="upcoming.length === 0" class="text-[12px] text-ink-3">Ничего не запланировано</p>
      <ul v-else class="space-y-1.5">
        <li v-for="m in upcoming" :key="m.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-bg-tint"
            @click="emit('select', m.id)"
          >
            <span class="flex w-9 shrink-0 flex-col items-center">
              <span class="text-[13px] font-semibold leading-none tabular">{{ new Date(m.date).getDate() }}</span>
              <span class="text-[10px] text-ink-3">{{ RU_MONTHS[new Date(m.date).getMonth()] }}</span>
            </span>
            <Avatar :name="m.member_name" :hue="m.hue" size="sm" />
            <span class="min-w-0">
              <span class="block truncate text-[12px] text-ink">{{ m.member_name }}</span>
              <span class="block text-[10px] text-ink-3 tabular">{{ hhmm(m.date) }} · {{ m.duration_min }} мин</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section class="rounded-lg border border-line bg-bg-elev p-3">
      <h3 class="mb-2 text-[13px] font-semibold text-ink">Загрузка по неделе</h3>
      <div class="flex items-end justify-between gap-1" :style="{ height: '64px' }">
        <div v-for="(n, i) in loads" :key="i" class="flex flex-1 flex-col items-center justify-end gap-1">
          <div class="w-full rounded-t bg-brand" :style="{ height: `${4 + (n / maxLoad) * 44}px` }" :title="`${n}`" />
          <span class="text-[10px] text-ink-3">{{ RU_DOW[i] }}</span>
        </div>
      </div>
    </section>

    <section class="rounded-lg border border-line bg-bg-elev p-3">
      <h3 class="mb-2 text-[13px] font-semibold text-ink">Легенда</h3>
      <ul class="space-y-1 text-[12px] text-ink-2">
        <li v-for="s in LEGEND" :key="s" class="flex items-center gap-2">
          <span :class="cn('h-2 w-2 rounded-full', STATE_META[s]!.dot)" />
          {{ STATE_META[s]!.label }}
        </li>
      </ul>
    </section>
  </div>
</template>
