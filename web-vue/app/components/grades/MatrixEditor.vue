<script setup lang="ts">
import { computed } from "vue";
import { ArrowUp, ArrowDown, Trash2, Pencil, Plus } from "lucide-vue-next";
import { cn } from "~/lib/utils";
import type { DraftBlock, DraftLevel } from "./editorTypes";

const props = defineProps<{ blocks: DraftBlock[]; levels: DraftLevel[] }>();
const emit = defineEmits<{
  rename: [blockIdx: number, name: string];
  move: [from: number, to: number];
  delete: [blockIdx: number];
  add: [];
  openCell: [blockIdx: number, levelOrd: number];
}>();

const cols = computed(() => [...props.levels].sort((a, b) => a.ord - b.ord));
const cellOf = (b: DraftBlock, ord: number) => b.cells.find((c) => c.level === ord);
const isEmpty = (b: DraftBlock, ord: number) => {
  const c = cellOf(b, ord);
  return !(c && c.required && c.text);
};
const cellLabel = (b: DraftBlock, ord: number) => {
  const c = cellOf(b, ord);
  return c && !c.required ? "Не требуется." : c?.text || "добавить…";
};
</script>

<template>
  <div class="space-y-3">
    <div class="overflow-x-auto pb-1">
      <div
        class="grid min-w-[900px] gap-px overflow-hidden rounded-xl border border-line bg-line"
        :style="{ gridTemplateColumns: `220px repeat(${cols.length}, minmax(150px, 1fr))` }"
      >
        <div class="bg-bg-tint px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Блок · уровень
        </div>
        <div v-for="l in cols" :key="l.ord" class="flex flex-col gap-px bg-brand px-3 py-2.5 text-[#1A1100]">
          <span class="text-[13px] font-extrabold tabular">{{ l.code }}</span>
          <span class="text-[11px] font-semibold opacity-85">{{ l.name }}</span>
        </div>

        <div v-for="(b, bi) in blocks" :key="b.id ?? `new-${bi}`" class="contents">
          <div class="flex items-center gap-1.5 bg-bg-tint px-2.5 py-2.5">
            <div class="flex flex-col">
              <button
                type="button"
                aria-label="Блок вверх"
                :disabled="bi === 0"
                class="text-ink-4 hover:text-ink disabled:opacity-30"
                @click="emit('move', bi, bi - 1)"
              >
                <ArrowUp :size="13" />
              </button>
              <button
                type="button"
                aria-label="Блок вниз"
                :disabled="bi === blocks.length - 1"
                class="text-ink-4 hover:text-ink disabled:opacity-30"
                @click="emit('move', bi, bi + 1)"
              >
                <ArrowDown :size="13" />
              </button>
            </div>
            <input
              aria-label="Имя блока"
              :value="b.name"
              class="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-brand"
              @input="emit('rename', bi, ($event.target as HTMLInputElement).value)"
            />
            <button type="button" aria-label="Удалить блок" class="text-ink-4 hover:text-miss" @click="emit('delete', bi)">
              <Trash2 :size="13" />
            </button>
          </div>
          <button
            v-for="l in cols"
            :key="l.ord"
            type="button"
            :data-testid="`edit-cell-${b.id ?? `new-${bi}`}-${l.ord}`"
            :class="cn(
              'group relative flex items-center gap-1 p-3 text-left text-[12px] leading-relaxed transition-colors',
              isEmpty(b, l.ord) ? 'bg-bg-tint text-ink-4 italic hover:bg-brand-soft' : 'bg-bg-elev text-ink-2 hover:bg-brand-soft',
            )"
            @click="emit('openCell', bi, l.ord)"
          >
            <span class="min-w-0 flex-1">{{ cellLabel(b, l.ord) }}</span>
            <Pencil :size="11" class="shrink-0 text-ink-4 opacity-0 group-hover:opacity-100" />
          </button>
        </div>
      </div>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint"
      @click="emit('add')"
    >
      <Plus :size="14" /> Добавить блок компетенций
    </button>
  </div>
</template>
