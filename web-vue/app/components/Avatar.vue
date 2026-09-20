<script setup lang="ts">
import { computed } from "vue";
import { cn } from "~/lib/utils";
import { SIZES, initialsOf, type Size } from "./Avatar";

const props = withDefaults(
  defineProps<{ name: string; hue: number; size?: Size; class?: string }>(),
  { size: "md" },
);

const px = computed(() => SIZES[props.size]);
</script>

<template>
  <span
    :class="cn('inline-flex items-center justify-center font-semibold tabular', props.class)"
    :style="{
      width: `${px}px`,
      height: `${px}px`,
      fontSize: `${px * 0.4}px`,
      background: `oklch(0.92 0.05 ${hue})`,
      color: `oklch(0.30 0.08 ${hue})`,
      borderRadius: size === 'xl' ? '24px' : '9999px',
    }"
    aria-hidden="true"
  >
    {{ initialsOf(name) }}
  </span>
</template>
