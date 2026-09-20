<script setup lang="ts">
import { ref } from "vue";
import Modal from "~/components/Modal.vue";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{ submit: [comment: string]; close: [] }>();

const comment = ref("");
</script>

<template>
  <Modal title="Вернуть лиду" @close="emit('close')">
    <label for="reject-comment" class="mb-2 block text-[12.5px] text-ink-2">
      Причина возврата
    </label>
    <textarea
      id="reject-comment"
      v-model="comment"
      rows="4"
      placeholder="Что нужно доработать лиду перед повторной отправкой…"
      class="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
    />
    <div class="mt-3 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint"
        @click="emit('close')"
      >
        Отмена
      </button>
      <button
        type="button"
        :disabled="comment.trim().length === 0 || busy"
        class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
        @click="emit('submit', comment.trim())"
      >
        Вернуть лиду
      </button>
    </div>
  </Modal>
</template>
