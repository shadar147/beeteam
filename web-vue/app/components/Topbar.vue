<script setup lang="ts">
import { Search, Plus } from "lucide-vue-next";

defineProps<{ title: string }>();
</script>

<template>
  <div class="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] px-6 backdrop-blur">
    <div class="text-[13.5px] font-medium text-ink">{{ title }}</div>
    <div class="ml-auto flex items-center gap-2">
      <button class="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-bg-tint" title="Помощь">?</button>
      <button class="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-bg-tint" title="Поиск"><Search :size="14" /></button>
      <button class="flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-[#1A1100]" title="Новая 1-2-1">
        <Plus :size="13" /> Новая 1-2-1
      </button>
    </div>
  </div>
</template>
