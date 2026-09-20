<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <!-- Associates the label with the control via the accessible name. -->
  <label class="block">
    <span class="mb-1 block text-[12px] text-ink-2">{{ label }}</span>
    <slot />
  </label>
</template>
