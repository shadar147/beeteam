<script setup lang="ts">
import { computed } from "vue";
import type { Competency } from "~/lib/query/profile";

// `onEdit` is declared as a prop so the button renders only when a parent listens (`@edit`).
const props = defineProps<{ competency: Competency; onEdit?: () => void }>();
const pct = computed(() => Math.max(0, Math.min(10, props.competency.score)) * 10);
</script>

<template>
  <div class="py-1.5">
    <div class="mb-1 flex justify-between text-[12px]">
      <span class="text-ink-2">{{ competency.label }}</span>
      <span class="flex items-center gap-2">
        <span class="text-ink-3 tabular">{{ competency.score }}/10</span>
        <button v-if="onEdit" type="button" class="text-[12px] text-ink-3 hover:text-ink" @click="onEdit()">Изменить</button>
      </span>
    </div>
    <div class="h-2 overflow-hidden rounded-full bg-bg-sunken">
      <div data-testid="comp-fill" class="h-full rounded-full bg-brand" :style="{ width: `${pct}%` }" />
    </div>
  </div>
</template>
