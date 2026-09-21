<script setup lang="ts">
import FileGlyph from "~/components/FileGlyph.vue";
import { humanSize } from "~/lib/files";
import type { FileMeta } from "~/lib/query/profile";

// `onDownload`/`onDelete` are declared as props so each button renders only when a parent listens.
defineProps<{ file: FileMeta; onDownload?: (id: string) => void; onDelete?: (id: string) => void }>();
</script>

<template>
  <div class="flex items-center gap-3 border-b border-line-2 px-3 py-2.5 last:border-b-0 hover:bg-bg-tint">
    <FileGlyph :kind="file.kind" :size="36" />
    <div class="min-w-0 flex-1">
      <div class="truncate text-[13px] font-medium text-ink">{{ file.name }}</div>
      <div class="text-[11px] text-ink-3">
        <template v-if="file.meeting_label"><span>{{ file.meeting_label }}</span>{{ " · " }}</template>{{ file.uploaded_by }}
      </div>
    </div>
    <span class="text-[12px] text-ink-3 tabular">{{ humanSize(file.size_bytes) }}</span>
    <button v-if="onDownload" type="button" aria-label="Скачать" class="rounded px-2 py-1 text-ink-3 hover:bg-bg-sunken" @click="onDownload(file.id)">↓</button>
    <button v-if="onDelete" type="button" aria-label="Удалить" class="rounded px-2 py-1 text-ink-3 hover:bg-bg-sunken" @click="onDelete(file.id)">✕</button>
  </div>
</template>
