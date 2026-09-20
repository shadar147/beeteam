<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => document.addEventListener("keydown", onKey));
onUnmounted(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div data-testid="modal-scrim" class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="emit('close')" />
    <div
      role="dialog"
      :aria-label="title"
      class="relative z-10 w-full max-w-[460px] rounded-lg border border-line bg-bg-elev shadow-pop"
    >
      <div class="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-semibold text-ink">{{ title }}</h2>
        <button type="button" aria-label="Закрыть" class="text-ink-3 hover:text-ink" @click="emit('close')">✕</button>
      </div>
      <div class="px-5 py-4"><slot /></div>
    </div>
  </div>
</template>
