<script setup lang="ts">
import { computed, ref } from "vue";
import Modal from "~/components/Modal.vue";
import type { Discipline, GradeLevel, MatrixCell } from "~/lib/query/grades";

const props = defineProps<{ discipline: Discipline; levels: GradeLevel[] }>();

const open = ref<{ block: string; code: string; name: string; text: string } | null>(null);
const cols = computed(() => [...props.levels].sort((a, b) => a.ord - b.ord));

function cellOf(block: { cells: MatrixCell[] }, ord: number) {
  return block.cells.find((c) => c.level === ord);
}
</script>

<template>
  <div class="overflow-x-auto pb-1">
    <div
      class="grid min-w-[900px] gap-px overflow-hidden rounded-xl border border-line bg-line"
      :style="{ gridTemplateColumns: `180px repeat(${cols.length}, minmax(150px, 1fr))` }"
    >
      <!-- header row -->
      <div class="sticky left-0 z-20 bg-bg-tint px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Блок · уровень
      </div>
      <div v-for="l in cols" :key="l.ord" class="flex flex-col gap-px bg-brand px-3 py-2.5 text-[#1A1100]">
        <span class="text-[13px] font-extrabold tabular">{{ l.code }}</span>
        <span class="text-[11px] font-semibold opacity-85">{{ l.name }}</span>
      </div>

      <!-- body rows -->
      <div v-for="b in discipline.blocks" :key="b.id" class="contents">
        <div class="sticky left-0 z-10 flex items-center bg-bg-tint px-3.5 py-3.5 text-[12.5px] font-semibold text-ink">
          {{ b.name }}
        </div>
        <template v-for="l in cols" :key="l.ord">
          <button
            v-if="cellOf(b, l.ord)?.required && cellOf(b, l.ord)?.text"
            type="button"
            class="bg-bg-elev p-3 text-left text-[12px] leading-relaxed text-ink-2 transition-colors hover:bg-brand-soft"
            @click="open = { block: b.name, code: l.code, name: l.name, text: cellOf(b, l.ord)!.text! }"
          >
            {{ cellOf(b, l.ord)!.text }}
          </button>
          <div v-else class="bg-bg-tint p-3 text-[12px] italic leading-relaxed text-ink-4">
            {{ cellOf(b, l.ord) && !cellOf(b, l.ord)!.required ? "Не требуется." : "—" }}
          </div>
        </template>
      </div>
    </div>

    <p class="mt-2.5 text-[12px] italic text-ink-3">
      Сотрудник уровня N владеет всеми компетенциями ≤N. Клик по ячейке — детали.
    </p>

    <Modal v-if="open" :title="`${open.block} · ${open.code} ${open.name}`" @close="open = null">
      <div class="mb-1 text-[11px] uppercase tracking-wide text-ink-3">
        Что должен демонстрировать сотрудник на этом уровне
      </div>
      <p class="text-[13px] leading-relaxed text-ink-2">{{ open.text }}</p>
    </Modal>
  </div>
</template>
