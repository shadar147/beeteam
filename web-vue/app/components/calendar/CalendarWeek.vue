<script setup lang="ts">
import { computed } from "vue";
import { cn } from "~/lib/utils";
import Avatar from "~/components/Avatar.vue";
import { RU_DOW, sameDay, STATE_META } from "~/lib/calendar";
import type { CalendarMeeting } from "~/lib/query/calendar";

const props = defineProps<{
  weekStart: Date; // Monday
  today: Date;
  meetings: CalendarMeeting[];
}>();
const emit = defineEmits<{ select: [id: string] }>();

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(props.weekStart.getFullYear(), props.weekStart.getMonth(), props.weekStart.getDate() + i);
    const dayMtgs = props.meetings
      .filter((x) => sameDay(new Date(x.date), d))
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return { d, dayMtgs };
  }),
);
</script>

<template>
  <div class="grid grid-cols-7 gap-2">
    <div
      v-for="({ d, dayMtgs }, i) in days"
      :key="i"
      :class="cn('rounded-lg border bg-bg-elev p-2', sameDay(d, today) ? 'border-brand' : 'border-line')"
    >
      <div class="mb-2 text-[11px] text-ink-3">
        {{ RU_DOW[i] }} <span class="tabular">{{ d.getDate() }}</span>
      </div>
      <div class="space-y-1">
        <button
          v-for="mt in dayMtgs"
          :key="mt.id"
          type="button"
          class="flex w-full items-center gap-1.5 rounded-md border border-line-2 bg-bg-tint p-1.5 text-left hover:bg-bg-sunken"
          @click="emit('select', mt.id)"
        >
          <span :class="cn('h-1.5 w-1.5 shrink-0 rounded-full', STATE_META[mt.state]?.dot ?? 'bg-ink-4')" />
          <Avatar :name="mt.member_name" :hue="mt.hue" size="sm" />
          <span class="min-w-0">
            <span class="block truncate text-[11px] text-ink">{{ mt.member_name }}</span>
            <span class="block text-[10px] text-ink-3 tabular">{{ hhmm(mt.date) }} · {{ mt.duration_min }} мин</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
