<script setup lang="ts">
import { computed } from "vue";
import Pill from "~/components/Pill.vue";
import type { ReviewScore } from "~/lib/query/reviews";

const props = defineProps<{ scores: ReviewScore[] }>();

const anySelf = computed(() => props.scores.some((s) => s.self_ord != null));

function gapOf(s: ReviewScore) {
  return s.self_ord != null ? s.self_ord - s.lead_ord : null;
}
</script>

<template>
  <div class="space-y-1.5">
    <p v-if="!anySelf" class="text-[12px] text-ink-3">Самооценка не получена — показана только оценка лида.</p>
    <div v-for="s in scores" :key="s.block_id" class="flex items-center gap-3 rounded-lg bg-bg-tint px-3 py-2">
      <span class="w-[160px] truncate text-[12.5px] text-ink-2">{{ s.block_name }}</span>
      <span class="text-[12px] tabular text-ink-3">{{ s.self_ord != null ? `○ IC${s.self_ord}` : "—" }}</span>
      <span class="text-[12px] font-semibold tabular text-ink">● IC{{ s.lead_ord }}</span>
      <span class="ml-auto">
        <Pill v-if="gapOf(s) != null && gapOf(s) !== 0" :variant="Math.abs(gapOf(s)!) >= 2 ? 'miss' : 'warn'">
          расхождение {{ gapOf(s)! > 0 ? `+${gapOf(s)}` : gapOf(s) }}
        </Pill>
        <Pill v-if="gapOf(s) === 0" variant="ok" dot>совпадает</Pill>
      </span>
    </div>
  </div>
</template>
