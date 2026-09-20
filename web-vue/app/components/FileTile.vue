<script setup lang="ts">
import FileGlyph from "~/components/FileGlyph.vue";
import { humanSize } from "~/lib/files";
import type { FileMeta } from "~/lib/query/profile";

// `onDownload` is declared as a prop so the tile is clickable only when a parent listens.
defineProps<{ file: FileMeta; onDownload?: (id: string) => void }>();
</script>

<template>
  <div
    :class="`flex flex-col items-center gap-2 rounded-lg border border-line bg-bg-elev p-4 text-center hover:bg-bg-tint${onDownload ? ' cursor-pointer' : ''}`"
    @click="onDownload?.(file.id)"
  >
    <FileGlyph :kind="file.kind" :size="48" />
    <div class="w-full truncate text-[12px] font-medium text-ink">{{ file.name }}</div>
    <div class="text-[11px] text-ink-3 tabular">{{ humanSize(file.size_bytes) }}</div>
  </div>
</template>
