<script lang="ts">
export type CompetencyValues = { label: string; score: number };
</script>

<script setup lang="ts">
import { ref } from "vue";
import Field from "~/components/goals/Field.vue";
import FormFooter from "~/components/goals/FormFooter.vue";
import type { Competency } from "~/lib/query/profile";

const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

const props = defineProps<{ initial?: Competency; onDelete?: () => void; pending: boolean; error: string | null }>();
const emit = defineEmits<{ submit: [v: CompetencyValues] }>();

const label = ref(props.initial?.label ?? "");
const score = ref(props.initial?.score ?? 5);

function submit() {
  if (!label.value.trim()) return;
  emit("submit", { label: label.value.trim(), score: Math.max(0, Math.min(10, score.value)) });
}
</script>

<template>
  <form class="space-y-3 text-[13px]" @submit.prevent="submit">
    <Field label="Компетенция"><input v-model="label" :class="inp" /></Field>
    <Field label="Оценка">
      <input
        type="number" min="0" max="10" :class="inp" :value="score"
        @input="score = Number(($event.target as HTMLInputElement).value)"
      />
    </Field>
    <FormFooter :pending="pending" :error="error" :on-delete="onDelete" />
  </form>
</template>
