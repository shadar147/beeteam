<script setup lang="ts">
import { computed, ref } from "vue";
import SegControl from "~/components/SegControl.vue";
import FileRow from "~/components/FileRow.vue";
import FileTile from "~/components/FileTile.vue";
import FileDropzone from "~/components/FileDropzone.vue";
import { humanSize, FILE_KINDS } from "~/lib/files";
import { useMemberFiles } from "~/lib/query/profile";
import { downloadFile, useDeleteFile, zipUrl, DemoFileError } from "~/lib/query/files";

const props = defineProps<{ memberId: string }>();
const { data, isLoading, isError, refetch } = useMemberFiles(() => props.memberId);
const kind = ref("all");
const view = ref("list");
const del = useDeleteFile(() => props.memberId);
const toast = ref<string | null>(null);

async function onDownload(id: string) {
  toast.value = null;
  try { await downloadFile(id); }
  catch (e) { toast.value = e instanceof DemoFileError ? e.message : "Не удалось скачать файл"; }
}
function onDelete(id: string) {
  if (confirm("Удалить файл?")) del.mutate(id);
}

const all = computed(() => data.value ?? []);
const shown = computed(() => (kind.value === "all" ? all.value : all.value.filter((f) => f.kind === kind.value)));
const totalBytes = computed(() => all.value.reduce((s, f) => s + f.size_bytes, 0));
const last = computed(() => all.value[0]?.created_at);

const kindOptions = computed(() =>
  FILE_KINDS.map((k) => (k.value === "all" ? { value: "all", label: `Все · ${all.value.length}` } : k)),
);
</script>

<template>
  <div v-if="isLoading" class="text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="isError" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
    Не удалось загрузить файлы. <button class="underline" @click="refetch()">Повторить</button>
  </div>
  <div v-else class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <SegControl :options="kindOptions" :value="kind" @change="kind = $event" />
      <div class="flex items-center gap-2">
        <SegControl
          :options="[{ value: 'list', label: 'Список' }, { value: 'grid', label: 'Плитки' }]"
          :value="view"
          @change="view = $event"
        />
        <a :href="zipUrl(memberId)" class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">Скачать .zip</a>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-3 text-[13px]">
      <div class="rounded-lg border border-line bg-bg-elev p-3">
        <div class="text-[11px] uppercase text-ink-3">Всего</div>
        <div class="text-[16px] font-semibold text-ink tabular">{{ all.length }} файлов</div>
      </div>
      <div class="rounded-lg border border-line bg-bg-elev p-3">
        <div class="text-[11px] uppercase text-ink-3">Объём</div>
        <div class="text-[16px] font-semibold text-ink tabular">{{ humanSize(totalBytes) }}</div>
      </div>
      <div class="rounded-lg border border-line bg-bg-elev p-3">
        <div class="text-[11px] uppercase text-ink-3">Последний</div>
        <div class="text-[16px] font-semibold text-ink tabular">
          {{ last ? new Date(last).toLocaleDateString("ru-RU") : "—" }}
        </div>
      </div>
    </div>

    <div v-if="toast" class="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">{{ toast }}</div>

    <div
      v-if="shown.length === 0"
      class="rounded-lg border border-dashed border-line-strong bg-bg-tint p-10 text-center text-[13px] text-ink-3"
    >
      Файлов пока нет
    </div>
    <div v-else-if="view === 'list'" class="rounded-lg border border-line bg-bg-elev">
      <FileRow v-for="f in shown" :key="f.id" :file="f" @download="onDownload" @delete="onDelete" />
    </div>
    <div v-else class="grid grid-cols-4 gap-3">
      <FileTile v-for="f in shown" :key="f.id" :file="f" @download="onDownload" />
    </div>

    <FileDropzone :member-id="memberId" @uploaded="refetch()" />
  </div>
</template>
