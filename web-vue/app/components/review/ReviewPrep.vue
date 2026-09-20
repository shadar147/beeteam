<script setup lang="ts">
import { computed } from "vue";
import { Target, Clock, Sparkles, ShieldCheck } from "lucide-vue-next";
import { cn } from "~/lib/utils";
import type { Evidence } from "~/lib/query/evidence";

const props = defineProps<{
  gradeCode: string;
  targetCode: string | null;
  promo: boolean;
  readyMonths: number;
  selfRows: { name: string; ord: number | null; code: string }[];
  evidence: Evidence[];
}>();

function fmt(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const hasSelf = computed(() => props.selfRows.some((r) => r.ord != null));
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-line bg-bg-elev p-4">
        <Target :size="18" class="text-ink-3" />
        <div class="mt-2 text-[20px] font-bold tabular text-ink">
          {{ promo && targetCode ? `${gradeCode} → ${targetCode}` : gradeCode }}
        </div>
        <div class="text-[11.5px] text-ink-3">{{ promo ? "кандидат на повышение" : "подтверждение грейда" }}</div>
      </div>
      <div class="rounded-xl border border-line bg-bg-elev p-4">
        <Clock :size="18" class="text-ink-3" />
        <div class="mt-2 text-[20px] font-bold tabular text-ink">{{ readyMonths }} мес</div>
        <div class="text-[11.5px] text-ink-3">стабильного проявления L+1</div>
      </div>
      <div class="rounded-xl border border-line bg-bg-elev p-4">
        <Sparkles :size="18" class="text-ink-3" />
        <div class="mt-2 text-[20px] font-bold tabular text-ink">{{ evidence.length }}</div>
        <div class="text-[11.5px] text-ink-3">свидетельств из 1-2-1</div>
      </div>
    </div>

    <div class="rounded-xl border border-line bg-bg-elev p-5">
      <div class="text-[13px] font-semibold text-ink">Самооценка сотрудника</div>
      <template v-if="hasSelf">
        <div class="mb-3 text-[12px] text-ink-3">
          Получена заранее · сотрудник не видит вашу оценку до завершения
        </div>
        <div class="grid gap-1.5 sm:grid-cols-2">
          <div v-for="r in selfRows" :key="r.name" class="flex items-center justify-between rounded-lg bg-bg-tint px-3 py-2">
            <span class="text-[12.5px] text-ink-2">{{ r.name }}</span>
            <span class="text-[11.5px] font-semibold tabular text-ink">{{ r.ord != null ? r.code : "—" }}</span>
          </div>
        </div>
      </template>
      <p v-else class="mt-1 text-[12.5px] text-ink-3">
        Самооценка не получена — шкалы на шаге оценки будут без маркера сотрудника.
      </p>
    </div>

    <div class="rounded-xl border border-line bg-bg-elev p-5">
      <div class="mb-3 text-[13px] font-semibold text-ink">Сводка свидетельств из 1-2-1</div>
      <p v-if="evidence.length === 0" class="text-[12.5px] text-ink-3">Нет зафиксированных свидетельств.</p>
      <div v-else class="space-y-2">
        <div v-for="e in evidence" :key="e.id" class="flex items-start gap-2.5">
          <span :class="cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.status === 'partial' ? 'bg-warn' : 'bg-ok')" />
          <span class="rounded-full bg-brand-soft px-1.5 text-[10px] leading-[18px] text-brand-text">
            {{ e.block_name }} · IC{{ e.level_ord }}
          </span>
          <span class="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">{{ e.note }}</span>
          <span class="text-[11px] text-ink-4">{{ fmt(e.created_at) }}</span>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 text-[12px] text-ink-3">
      <ShieldCheck :size="14" /> Сотрудник не видит вашу оценку до завершения ревью.
    </div>
  </div>
</template>
