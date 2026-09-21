<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ compa: number; gradeCode: string }>();

const pct = computed(() => Math.round(props.compa * 100));
const note = computed(() =>
  props.compa < 0.4
    ? "В нижней части полосы — есть пространство для роста внутри грейда."
    : props.compa < 0.66
      ? "Около медианы грейда — соответствует уровню."
      : "В верхней части полосы — близко к потолку грейда, основной рост через повышение.",
);
</script>

<template>
  <div class="rounded-xl border border-line bg-bg-elev p-5">
    <div class="text-[13px] font-semibold text-ink">Позиция в полосе</div>
    <div class="mb-5 text-[12px] text-ink-3">{{ gradeCode }} · вид лида, без точных окладов</div>
    <div class="relative flex h-7 items-center">
      <div class="absolute h-2 w-full rounded-full border border-line bg-gradient-to-r from-bg-sunken via-brand-soft to-brand" />
      <div class="absolute h-3.5 w-0.5 rounded bg-ink-4" style="left: 0%" />
      <div class="absolute h-[18px] w-0.5 rounded bg-brand-strong" style="left: 50%" />
      <div class="absolute h-3.5 w-0.5 rounded bg-ink-4" style="left: calc(100% - 2px)" />
      <div
        data-testid="compa-marker"
        class="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-bg-elev bg-ink shadow"
        :style="{ left: `${pct}%` }"
        title="позиция сотрудника"
      />
    </div>
    <p class="mt-4 text-[12px] leading-relaxed text-ink-3">{{ note }}</p>
  </div>
</template>
