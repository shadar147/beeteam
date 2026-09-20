<script setup lang="ts">
import { computed } from "vue";
import { Layers } from "lucide-vue-next";
import GradeChip from "./GradeChip.vue";
import type { DraftLevel } from "./editorTypes";

const props = defineProps<{ levels: DraftLevel[] }>();
const emit = defineEmits<{
  change: [ord: number, patch: Partial<Omit<DraftLevel, "ord" | "code">>];
}>();

const rows = computed(() => [...props.levels].sort((a, b) => a.ord - b.ord));
const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement).value;
</script>

<template>
  <div class="space-y-2.5">
    <div class="flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12.5px] text-ink-3">
      <Layers :size="15" class="mt-0.5 shrink-0" />
      Уровни общие для всех дисциплин. Изменения коснутся всей системы грейдов.
    </div>
    <div
      v-for="l in rows"
      :key="l.ord"
      class="grid items-start gap-4 rounded-xl border border-line bg-bg-elev p-4"
      style="grid-template-columns: 60px 200px 1fr 1fr"
    >
      <GradeChip :ord="l.ord" :code="l.code" />
      <div class="space-y-1.5">
        <input
          aria-label="Название уровня"
          :value="l.name"
          class="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
          @input="emit('change', l.ord, { name: valueOf($event) })"
        />
        <input
          aria-label="Опыт"
          :value="l.exp"
          class="w-full rounded-md border border-line bg-bg px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-brand"
          @input="emit('change', l.ord, { exp: valueOf($event) })"
        />
      </div>
      <div>
        <div class="mb-0.5 text-[10.5px] uppercase tracking-wide text-ink-4">Автономность</div>
        <textarea
          aria-label="Автономность"
          rows="2"
          :value="l.autonomy"
          class="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand"
          @input="emit('change', l.ord, { autonomy: valueOf($event) })"
        />
      </div>
      <div>
        <div class="mb-0.5 text-[10.5px] uppercase tracking-wide text-ink-4">Масштаб влияния</div>
        <textarea
          aria-label="Масштаб влияния"
          rows="2"
          :value="l.scope"
          class="w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand"
          @input="emit('change', l.ord, { scope: valueOf($event) })"
        />
      </div>
    </div>
  </div>
</template>
