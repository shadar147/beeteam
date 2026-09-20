<script setup lang="ts">
import { useCreateMeeting } from "~/lib/query/meetings";
import { useDrawerStore } from "~/stores/drawer";

const props = defineProps<{ memberId: string }>();
const { mutate, isPending } = useCreateMeeting();
const drawer = useDrawerStore();
</script>

<template>
  <div class="flex shrink-0 gap-2">
    <button type="button" class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Написать</button>
    <button type="button" class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Экспорт</button>
    <button
      type="button"
      :disabled="isPending"
      class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
      @click="mutate(props.memberId, { onSuccess: (m) => drawer.open(m.id) })"
    >
      Начать 1-2-1
    </button>
  </div>
</template>
