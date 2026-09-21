<script lang="ts">
export type OkrValues = {
  quarter: string; title: string; key_result: string; progress: number; status: string; due: string;
};
</script>

<script setup lang="ts">
import { ref } from "vue";
import SegControl from "~/components/SegControl.vue";
import Field from "~/components/goals/Field.vue";
import FormFooter from "~/components/goals/FormFooter.vue";
import type { Goal } from "~/lib/query/profile";

function isoToDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Current quarter in the seeded "Q{n} {year}" format, e.g. "Q2 2026". */
function currentQuarter(): string {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

const props = defineProps<{ initial?: Goal; onDelete?: () => void; pending: boolean; error: string | null }>();
const emit = defineEmits<{ submit: [v: OkrValues] }>();

const quarter = ref(props.initial?.quarter ?? currentQuarter());
const title = ref(props.initial?.title ?? "");
const keyResult = ref(props.initial?.key_result ?? "");
const progress = ref(props.initial?.progress ?? 0);
const status = ref(props.initial?.status ?? "ontrack");
const due = ref(props.initial ? isoToDate(props.initial.due) : "");

function submit() {
  if (!title.value.trim() || !keyResult.value.trim() || !due.value) return;
  emit("submit", {
    quarter: quarter.value, title: title.value.trim(), key_result: keyResult.value.trim(),
    progress: Math.max(0, Math.min(100, progress.value)), status: status.value,
    due: new Date(due.value).toISOString(),
  });
}
</script>

<template>
  <form class="space-y-3 text-[13px]" @submit.prevent="submit">
    <Field label="Цель"><input v-model="title" :class="inp" /></Field>
    <Field label="Ключевой результат"><input v-model="keyResult" :class="inp" /></Field>
    <Field label="Квартал"><input v-model="quarter" :class="inp" /></Field>
    <Field label="Прогресс">
      <input
        type="number" min="0" max="100" :class="inp" :value="progress"
        @input="progress = Number(($event.target as HTMLInputElement).value)"
      />
    </Field>
    <div>
      <div class="mb-1 text-[12px] text-ink-2">Статус</div>
      <SegControl
        :options="[{ value: 'ontrack', label: 'В работе' }, { value: 'risk', label: 'Под риском' }, { value: 'done', label: 'Готово' }]"
        :value="status" @change="status = $event"
      />
    </div>
    <Field label="Срок"><input v-model="due" type="date" :class="inp" /></Field>
    <FormFooter :pending="pending" :error="error" :on-delete="onDelete" />
  </form>
</template>
