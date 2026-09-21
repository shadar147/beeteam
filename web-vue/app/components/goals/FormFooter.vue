<script setup lang="ts">
// `onDelete` is declared as a prop so the button renders only when a parent listens (`@delete`).
defineProps<{ pending: boolean; error: string | null; onDelete?: () => void }>();
</script>

<template>
  <div v-if="error" class="rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">{{ error }}</div>
  <div class="flex items-center gap-2 pt-1">
    <button
      type="submit"
      :disabled="pending"
      class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
    >
      {{ pending ? "Сохранение…" : "Сохранить" }}
    </button>
    <button
      v-if="onDelete"
      type="button"
      :disabled="pending"
      class="ml-auto rounded-md border border-miss/40 px-3 py-1.5 text-[13px] text-miss disabled:opacity-60"
      @click="onDelete()"
    >
      Удалить
    </button>
  </div>
</template>
