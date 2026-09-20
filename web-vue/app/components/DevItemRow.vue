<script setup lang="ts">
import { cn } from "~/lib/utils";
import type { DevItem } from "~/lib/query/profile";

const DOT: Record<string, string> = {
  in_progress: "bg-brand",
  planned: "border border-line-strong",
  done: "bg-ok",
};

// `onEdit` is declared as a prop so the button renders only when a parent listens (`@edit`).
defineProps<{ item: DevItem; onEdit?: () => void }>();
</script>

<template>
  <div class="flex items-start gap-3 border-b border-line-2 py-2.5 last:border-b-0">
    <span :class="cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', DOT[item.status] ?? DOT.planned)" />
    <div class="min-w-0">
      <div class="text-[13px] font-medium text-ink">{{ item.title }}</div>
      <div class="text-[11px] text-ink-3">
        {{ item.kind }}<template v-if="item.note">{{ " · " }}<span>{{ item.note }}</span></template>
      </div>
    </div>
    <button v-if="onEdit" type="button" class="ml-auto text-[12px] text-ink-3 hover:text-ink" @click="onEdit()">Изменить</button>
  </div>
</template>
