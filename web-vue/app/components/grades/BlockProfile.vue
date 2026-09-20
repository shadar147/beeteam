<script setup lang="ts">
import { computed } from "vue";
import { TrendingUp } from "lucide-vue-next";
import { cn } from "~/lib/utils";

type Block = { name: string; cur: number };

const props = defineProps<{
  blocks: Block[];
  gradeOrd: number;
  targetOrd: number | null;
  levelCount: number;
}>();

const SEG_BG: Record<string, string> = {
  fill: "bg-brand",
  ahead: "bg-ok",
  target: "bg-brand-soft",
  empty: "bg-bg-sunken",
};

function segClass(n: number, cur: number) {
  if (n <= cur) return n > props.gradeOrd ? "ahead" : "fill";
  if (props.targetOrd && n <= props.targetOrd) return "target";
  return "empty";
}

function tone(cur: number) {
  return cur > props.gradeOrd
    ? "text-ok"
    : props.targetOrd && cur < props.targetOrd
      ? "text-brand-strong"
      : "text-ink-2";
}

const levels = computed(() => Array.from({ length: props.levelCount }, (_, i) => i + 1));
</script>

<template>
  <div class="rounded-xl border border-line bg-bg-elev p-5">
    <div class="mb-3 text-[13px] font-semibold text-ink">Профиль по блокам</div>
    <div class="space-y-3">
      <div v-for="b in blocks" :key="b.name">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[12.5px] text-ink-2">{{ b.name }}</span>
          <span :class="cn('flex items-center gap-1 text-[12px] font-semibold tabular', tone(b.cur))">
            IC{{ b.cur }}
            <TrendingUp v-if="b.cur > gradeOrd" :size="11" />
          </span>
        </div>
        <div class="relative flex gap-1">
          <span
            v-for="n in levels"
            :key="n"
            :data-seg="segClass(n, b.cur)"
            :class="cn('h-2 flex-1 rounded-sm', SEG_BG[segClass(n, b.cur)])"
          />
          <span
            data-testid="grade-marker"
            class="absolute -top-0.5 h-3 w-0.5 rounded bg-ink"
            :style="{ left: `calc(${((gradeOrd - 0.5) / levelCount) * 100}%)` }"
          />
        </div>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-3">
      <span class="flex items-center gap-1"><i class="h-2 w-2 rounded-sm bg-brand" /> освоено</span>
      <span class="flex items-center gap-1"><i class="h-2 w-2 rounded-sm bg-ok" /> выше грейда</span>
      <span class="flex items-center gap-1"><i class="h-2 w-2 rounded-sm bg-brand-soft" /> цель</span>
      <span class="flex items-center gap-1"><i class="h-2.5 w-0.5 rounded bg-ink" /> текущий грейд</span>
    </div>
  </div>
</template>
