<script setup lang="ts">
import { cn } from "~/lib/utils";
import type { MeetingListItem } from "~/lib/query/profile";

const TITLE: Record<string, string> = { done: "Завершена", planned: "Запланирована", miss: "Пропущена" };

function chip(iso: string) {
  const d = new Date(iso);
  return { day: d.getDate(), mon: d.toLocaleDateString("ru-RU", { month: "short" }) };
}

defineProps<{ items: MeetingListItem[]; activeId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div
    v-if="items.length === 0"
    class="rounded-lg border border-dashed border-line-strong bg-bg-tint p-8 text-center text-[13px] text-ink-3"
  >
    Встреч пока нет
  </div>
  <div v-else class="space-y-2">
    <button
      v-for="m in items"
      :key="m.id"
      type="button"
      :data-testid="`feed-item-${m.id}`"
      :data-active="m.id === activeId"
      :class="cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left',
        m.id === activeId ? 'border-brand bg-brand-soft' : 'border-line bg-bg-elev hover:bg-bg-tint',
      )"
      @click="emit('select', m.id)"
    >
      <span class="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-bg-tint text-ink-2">
        <span class="text-[15px] font-semibold leading-none tabular">{{ chip(m.date).day }}</span>
        <span class="text-[10px] text-ink-3">{{ chip(m.date).mon }}</span>
      </span>
      <span class="min-w-0">
        <span class="block text-[13px] font-medium text-ink">{{ TITLE[m.state] ?? m.state }}</span>
        <span class="line-clamp-2 text-[12px] text-ink-3">{{ m.preview }}</span>
      </span>
    </button>
  </div>
</template>
