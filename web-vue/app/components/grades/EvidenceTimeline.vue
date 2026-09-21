<script setup lang="ts">
import { cn } from "~/lib/utils";
import type { Evidence } from "~/lib/query/evidence";

defineProps<{ evidence: Evidence[] }>();

function fmt(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
</script>

<template>
  <div class="rounded-xl border border-line bg-bg-elev p-5">
    <div class="mb-2 flex items-center justify-between">
      <div class="text-[13px] font-semibold text-ink">Свидетельства из 1-2-1</div>
      <span class="rounded-full border border-line bg-bg-tint px-2 text-[11px] text-ink-3">{{ evidence.length }}</span>
    </div>
    <p v-if="evidence.length === 0" class="text-[12.5px] leading-relaxed text-ink-3">
      Пока нет зафиксированных свидетельств. Отмечайте проявленные компетенции во время 1-2-1.
    </p>
    <div v-else class="space-y-2">
      <div v-for="e in evidence" :key="e.id" class="flex gap-2.5">
        <span :class="cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.status === 'partial' ? 'bg-warn' : 'bg-ok')" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-brand-soft px-1.5 text-[10px] text-brand-text">{{ e.block_name }} · IC{{ e.level_ord }}</span>
            <span v-if="e.status === 'partial'" class="rounded-full bg-warn-soft px-1.5 text-[10px] text-warn">частично</span>
            <span class="ml-auto text-[11px] text-ink-4">{{ fmt(e.created_at) }}</span>
          </div>
          <div class="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{{ e.note || "без заметки" }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
