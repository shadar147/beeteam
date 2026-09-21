<script setup lang="ts">
import { ref } from "vue";
import { Sparkles } from "lucide-vue-next";
import Modal from "~/components/Modal.vue";

const props = defineProps<{
  blockName: string;
  levelCode: string;
  levelName: string;
  initial: string | null;
}>();
const emit = defineEmits<{
  apply: [cell: { text: string | null; required: boolean }];
  close: [];
}>();

const val = ref(props.initial ?? "");
const na = ref(props.initial === null);

function apply() {
  if (na.value) emit("apply", { text: null, required: false });
  else emit("apply", { text: val.value, required: true });
  emit("close");
}
</script>

<template>
  <Modal :title="`${blockName} · ${levelCode} ${levelName}`" @close="emit('close')">
    <label for="cell-text" class="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">
      Текст компетенции
    </label>
    <textarea
      id="cell-text"
      rows="5"
      :value="na ? '' : val"
      :disabled="na"
      placeholder="Опишите компетенцию как наблюдаемое поведение…"
      class="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand disabled:opacity-50"
      @input="val = ($event.target as HTMLTextAreaElement).value"
    />
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        :class="`rounded-md border px-2.5 py-1.5 text-[12.5px] ${na ? 'border-brand bg-brand-soft text-brand-text' : 'border-line text-ink-2 hover:bg-bg-tint'}`"
        @click="na = !na"
      >
        Отметить «не требуется»
      </button>
      <button
        type="button"
        class="rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-2 hover:bg-bg-tint"
        @click="na = false; val = ''"
      >
        Очистить
      </button>
    </div>
    <div class="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-bg-tint p-3 text-[12px] text-ink-3">
      <Sparkles :size="14" class="mt-0.5 shrink-0" />
      Формулируйте как наблюдаемое поведение («проектирует…», «оптимизирует…»), а не как знание.
    </div>
    <div class="mt-4 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint"
        @click="emit('close')"
      >
        Отмена
      </button>
      <button
        type="button"
        class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
        @click="apply"
      >
        Применить
      </button>
    </div>
  </Modal>
</template>
