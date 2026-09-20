<script lang="ts">
export type AssessBlock = {
  blockId: string;
  name: string;
  selfOrd: number | null;
  leadOrd: number;
  evidenceCount: number;
  descByLevel: (string | null)[]; // index = ord - 1
};
</script>

<script setup lang="ts">
import { Layers } from "lucide-vue-next";
import { cn } from "~/lib/utils";
import Pill from "~/components/Pill.vue";

defineProps<{
  blocks: AssessBlock[];
  levels: { ord: number; code: string; name: string }[];
  targetOrd: number | null;
}>();
const emit = defineEmits<{ setLead: [blockId: string, ord: number] }>();

function gapOf(b: AssessBlock) {
  return b.selfOrd != null ? b.selfOrd - b.leadOrd : null;
}
</script>

<template>
  <div class="space-y-3.5">
    <div class="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
      <Layers :size="16" class="mt-0.5 shrink-0" />
      <div>
        Оцените каждый блок по матрице. <b class="text-ink-2">○</b> самооценка сотрудника,
        <b class="text-ink-2">●</b> ваша оценка.
        <template v-if="targetOrd != null"> Цель грейда — IC{{ targetOrd }}.</template>
      </div>
    </div>

    <div
      v-for="b in blocks"
      :key="b.blockId"
      :data-testid="`assess-${b.blockId}`"
      class="rounded-xl border border-line bg-bg-elev p-4"
    >
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <div class="text-[13.5px] font-semibold text-ink">{{ b.name }}</div>
          <div v-if="b.evidenceCount > 0" class="text-[11.5px] text-ink-4">{{ b.evidenceCount }} свидетельств в 1-2-1</div>
        </div>
        <Pill v-if="gapOf(b) != null && gapOf(b) !== 0" :variant="Math.abs(gapOf(b)!) >= 2 ? 'miss' : 'warn'">
          расхождение {{ gapOf(b)! > 0 ? `+${gapOf(b)}` : gapOf(b) }}
        </Pill>
        <Pill v-if="gapOf(b) === 0" variant="ok" dot>совпадает</Pill>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="l in levels"
          :key="l.ord"
          type="button"
          :aria-pressed="b.leadOrd === l.ord"
          :title="`${l.code} ${l.name}`"
          :class="cn(
            'relative rounded-md border py-1.5 text-[11.5px] font-semibold tabular',
            b.leadOrd === l.ord
              ? 'border-brand bg-brand text-brand-text'
              : 'border-line text-ink-3 hover:bg-bg-tint',
            targetOrd === l.ord && b.leadOrd !== l.ord && 'border-brand/50',
          )"
          @click="emit('setLead', b.blockId, l.ord)"
        >
          {{ l.code }}
          <span v-if="b.selfOrd === l.ord" class="absolute -top-1.5 right-0.5 text-[10px] text-ink-2" title="самооценка">○</span>
        </button>
      </div>
      <div class="mt-2.5 text-[12px] leading-relaxed text-ink-3">
        {{ b.descByLevel[b.leadOrd - 1] ?? "не требуется на этом уровне" }}
      </div>
    </div>
  </div>
</template>
