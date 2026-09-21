<script lang="ts">
export type SegOption = { value: string; label: string };
</script>

<script setup lang="ts">
import { cn } from "~/lib/utils";

const props = defineProps<{ options: SegOption[]; value: string; class?: string }>();
const emit = defineEmits<{ change: [value: string] }>();
</script>

<template>
  <div :class="cn('inline-flex rounded-md border border-line bg-bg-elev p-0.5', props.class)">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :data-seg="o.value"
      :aria-pressed="value === o.value"
      :class="cn(
        'rounded px-2.5 py-1 text-[12.5px] font-medium',
        value === o.value ? 'bg-bg-tint text-ink shadow-1' : 'text-ink-3 hover:text-ink-2',
      )"
      @click="emit('change', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
