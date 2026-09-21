<script setup lang="ts">
import { cn } from "~/lib/utils";

type GrowItem = { blockName: string; targetCode: string; text: string; evidenceCount?: number };

defineProps<{ items: GrowItem[]; targetCode: string }>();
</script>

<template>
  <div v-if="items.length > 0" class="rounded-xl border border-line bg-bg-elev p-5">
    <div class="text-[13px] font-semibold text-ink">Что показать для {{ targetCode }}</div>
    <div class="mb-3 text-[12px] text-ink-3">Конкретные компетенции из матрицы</div>
    <div class="space-y-3">
      <div v-for="it in items" :key="it.blockName" class="flex gap-3">
        <span
          :class="cn(
            'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px]',
            (it.evidenceCount ?? 0) > 0 ? 'border-ok bg-ok text-white' : 'border-line',
          )"
        >{{ (it.evidenceCount ?? 0) > 0 ? "✓" : "" }}</span>
        <div>
          <div class="text-[13px] font-semibold text-ink">{{ it.blockName }} → {{ it.targetCode }}</div>
          <div class="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{{ it.text }}</div>
          <div v-if="(it.evidenceCount ?? 0) > 0" class="mt-1 text-[11.5px] font-medium text-ok">
            {{ it.evidenceCount }} свидетельств зафиксировано в 1-2-1
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
