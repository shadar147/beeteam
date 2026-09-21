<script setup lang="ts">
defineProps<{ trend: number[] }>();
</script>

<template>
  <span data-mood-bars class="inline-flex items-end gap-[3px]" style="height: 18px">
    <i
      v-for="(v, i) in trend"
      :key="i"
      data-bar
      :style="{
        display: 'block',
        width: '4px',
        borderRadius: '2px',
        height: `${4 + v * 1.4}px`,
        opacity: 0.35 + (i / Math.max(trend.length - 1, 1)) * 0.65,
        background: v >= 7 ? 'var(--brand)' : v >= 5 ? 'var(--warn)' : 'var(--miss)',
      }"
    />
  </span>
</template>
