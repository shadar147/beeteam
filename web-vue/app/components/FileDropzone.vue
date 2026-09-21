<script setup lang="ts">
import { ref } from "vue";
import { uploadFile } from "~/lib/query/files";

const props = defineProps<{ memberId: string; meetingId?: string }>();
const emit = defineEmits<{ uploaded: [] }>();

const inputRef = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

async function handleFiles(list: FileList | null | undefined) {
  if (!list || list.length === 0) return;
  error.value = null;
  busy.value = true;
  try {
    for (const f of Array.from(list)) {
      await uploadFile(f, { memberId: props.memberId, meetingId: props.meetingId });
    }
    emit("uploaded");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Не удалось загрузить файл";
  } finally {
    busy.value = false;
    if (inputRef.value) inputRef.value.value = "";
  }
}
</script>

<template>
  <div>
    <div
      class="cursor-pointer rounded-lg border border-dashed border-line-strong bg-bg-tint p-6 text-center text-[12px] text-ink-3 hover:bg-bg-sunken"
      @click="inputRef?.click()"
      @dragover.prevent
      @drop.prevent="handleFiles($event.dataTransfer?.files)"
    >
      {{ busy ? "Загрузка…" : "Перетащите файлы сюда или нажмите, чтобы выбрать" }}
      <input
        ref="inputRef"
        data-testid="file-input"
        type="file"
        multiple
        class="hidden"
        @change="handleFiles(($event.target as HTMLInputElement).files)"
      />
    </div>
    <div v-if="error" class="mt-2 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">{{ error }}</div>
  </div>
</template>
