<script setup lang="ts">
import { cn } from "~/lib/utils";

withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    sub?: string;
    accentDot?: boolean;
    danger?: boolean;
    suffix?: string;
  }>(),
  { accentDot: false, danger: false },
);
</script>

<template>
  <div class="relative rounded-lg border border-line bg-bg-elev p-4">
    <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{{ label }}</div>
    <div :class="cn('mt-1 text-[26px] font-bold tabular', danger ? 'text-miss' : 'text-ink')">
      {{ value }}<span v-if="suffix" class="ml-1 text-[14px] text-ink-3">{{ suffix }}</span>
    </div>
    <div v-if="sub" class="mt-0.5 text-[12px] text-ink-3">{{ sub }}</div>
    <span v-if="accentDot" class="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand" />
  </div>
</template>
