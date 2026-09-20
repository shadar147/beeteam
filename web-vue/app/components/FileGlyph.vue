<script setup lang="ts">
import { computed } from "vue";
import { cn } from "~/lib/utils";

const GLYPH: Record<string, { label: string; cls: string }> = {
  doc: { label: "DOC", cls: "bg-info-soft text-info" },
  img: { label: "IMG", cls: "bg-ok-soft text-ok" },
  pdf: { label: "PDF", cls: "bg-miss-soft text-miss" },
  video: { label: "MP4", cls: "bg-brand-soft text-brand-text" },
  sheet: { label: "XLS", cls: "bg-warn-soft text-warn" },
};

const props = withDefaults(defineProps<{ kind: string; size?: number }>(), { size: 40 });
const g = computed(() => GLYPH[props.kind] ?? { label: "FILE", cls: "bg-bg-tint text-ink-3" });
</script>

<template>
  <span
    :class="cn('inline-flex items-center justify-center rounded-md text-[10px] font-semibold', g.cls)"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    {{ g.label }}
  </span>
</template>
