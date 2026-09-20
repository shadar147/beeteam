<script setup lang="ts">
import { computed } from "vue";
import { Sparkles } from "lucide-vue-next";
import Pill from "~/components/Pill.vue";
import GradeChip from "./GradeChip.vue";
import type { GradeLevel } from "~/lib/query/grades";

const props = defineProps<{ levels: GradeLevel[] }>();
const rows = computed(() => [...props.levels].sort((a, b) => a.ord - b.ord));
</script>

<template>
  <div class="space-y-2.5">
    <div class="flex items-start gap-3 rounded-xl border border-line bg-bg-tint p-3.5">
      <Sparkles :size="16" class="mt-0.5 shrink-0 text-brand-strong" />
      <p class="text-[13px] leading-relaxed text-ink-2">
        <b class="font-semibold text-ink">Принцип продвижения.</b>{{ " " }}
        <span class="text-ink-3">
          Для перехода на следующий уровень сотрудник должен стабильно проявлять компетенции L+1
          минимум 3–6 месяцев, а не эпизодически.
        </span>
      </p>
    </div>

    <div
      v-for="l in rows"
      :key="l.ord"
      class="grid items-center gap-4 rounded-xl border border-line bg-bg-elev p-4 sm:gap-[18px]"
      style="grid-template-columns: 60px 200px 1fr 1fr"
    >
      <GradeChip :ord="l.ord" :code="l.code" />
      <div class="min-w-0">
        <div class="text-[14.5px] font-bold tracking-tight text-ink">{{ l.name }}</div>
        <div class="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
          {{ l.exp }}
          <Pill v-if="l.mgr" variant="info">+ менедж. трек</Pill>
        </div>
      </div>
      <div>
        <div class="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Автономность</div>
        <div class="text-[12.5px] leading-snug text-ink-2">{{ l.autonomy }}</div>
      </div>
      <div>
        <div class="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Масштаб влияния</div>
        <div class="text-[12.5px] leading-snug text-ink-2">{{ l.scope }}</div>
      </div>
    </div>
  </div>
</template>
