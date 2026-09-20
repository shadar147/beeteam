<script setup lang="ts">
import { cn } from "~/lib/utils";

// Emoji → score: index 0..4 maps to 2/4/6/8/10.
const MOODS = ["😞", "😐", "🙂", "😄", "🤩"];

defineProps<{ value: string; score: number | null }>();
const emit = defineEmits<{ change: [emoji: string, score: number] }>();
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      v-for="(e, i) in MOODS"
      :key="e"
      type="button"
      :aria-label="e"
      :aria-pressed="e === value"
      :class="cn(
        'rounded-md px-2 py-1 text-[20px] leading-none',
        e === value ? 'bg-brand-soft ring-1 ring-brand' : 'hover:bg-bg-tint',
      )"
      @click="emit('change', e, (i + 1) * 2)"
    >
      {{ e }}
    </button>
    <span class="ml-1 text-[12px] text-ink-3 tabular">{{ score != null ? `${score}/10` : "—" }}</span>
  </div>
</template>
