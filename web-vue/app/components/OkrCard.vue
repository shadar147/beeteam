<script setup lang="ts">
import { computed } from "vue";
import Pill from "~/components/Pill.vue";
import type { Goal } from "~/lib/query/profile";

const STATUS: Record<string, { label: string; variant: "info" | "warn" | "ok" }> = {
  ontrack: { label: "В работе", variant: "info" },
  risk: { label: "Под риском", variant: "warn" },
  done: { label: "Готово", variant: "ok" },
};

function fmtDue(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// `onEdit` is declared as a prop so the button renders only when a parent listens (`@edit`).
const props = defineProps<{ okr: Goal; onEdit?: () => void }>();
const s = computed(() => STATUS[props.okr.status] ?? STATUS.ontrack!);
</script>

<template>
  <div class="rounded-lg border border-line bg-bg-elev p-4">
    <div class="flex items-start justify-between gap-2">
      <span class="text-[14px] font-semibold text-ink">{{ okr.title }}</span>
      <Pill :variant="s.variant" dot>{{ s.label }}</Pill>
      <button v-if="onEdit" type="button" class="ml-1 text-[12px] text-ink-3 hover:text-ink" @click="onEdit()">Изменить</button>
    </div>
    <p class="mt-1 text-[13px] text-ink-2">{{ okr.key_result }}</p>
    <div class="mt-3 h-2 overflow-hidden rounded-full bg-bg-sunken">
      <div class="h-full rounded-full bg-brand" :style="{ width: `${okr.progress}%` }" />
    </div>
    <div class="mt-1.5 flex justify-between text-[11px] text-ink-3 tabular">
      <span>{{ okr.progress }}%</span>
      <span>до {{ fmtDue(okr.due) }}</span>
    </div>
  </div>
</template>
