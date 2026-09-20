<script setup lang="ts">
import { Comment, Text, useSlots } from "vue";

defineProps<{ label: string }>();
const slots = useSlots();

// Like React's `children.trim()` check: a blank or missing slot renders nothing.
function isEmpty() {
  const nodes = slots.default?.() ?? [];
  return nodes.every(
    (n) => n.type === Comment || (n.type === Text && String(n.children).trim() === ""),
  );
}
</script>

<template>
  <div v-if="!isEmpty()" class="rounded-md border border-line-2 bg-bg-tint p-3">
    <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{{ label }}</div>
    <div class="text-[13px] text-ink-2"><slot /></div>
  </div>
</template>
