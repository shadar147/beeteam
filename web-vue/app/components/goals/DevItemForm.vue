<script lang="ts">
export type DevItemValues = { title: string; kind: string; status: string; note: string };
</script>

<script setup lang="ts">
import { ref } from "vue";
import SegControl from "~/components/SegControl.vue";
import Field from "~/components/goals/Field.vue";
import FormFooter from "~/components/goals/FormFooter.vue";
import type { DevItem } from "~/lib/query/profile";

const KINDS = ["Курс", "Доклад", "Книга", "Сертификат", "Менторство"];
const inp = "w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink";

const props = defineProps<{ initial?: DevItem; onDelete?: () => void; pending: boolean; error: string | null }>();
const emit = defineEmits<{ submit: [v: DevItemValues] }>();

const title = ref(props.initial?.title ?? "");
const kind = ref(props.initial?.kind ?? "");
const status = ref(props.initial?.status ?? "planned");
const note = ref(props.initial?.note ?? "");

function submit() {
  if (!title.value.trim() || !kind.value.trim()) return;
  emit("submit", { title: title.value.trim(), kind: kind.value.trim(), status: status.value, note: note.value.trim() });
}
</script>

<template>
  <form class="space-y-3 text-[13px]" @submit.prevent="submit">
    <Field label="Название"><input v-model="title" :class="inp" /></Field>
    <Field label="Тип">
      <input v-model="kind" :class="inp" list="dev-kinds" />
      <datalist id="dev-kinds"><option v-for="k in KINDS" :key="k" :value="k" /></datalist>
    </Field>
    <div>
      <div class="mb-1 text-[12px] text-ink-2">Статус</div>
      <SegControl
        :options="[{ value: 'planned', label: 'Запланировано' }, { value: 'in_progress', label: 'В работе' }, { value: 'done', label: 'Готово' }]"
        :value="status" @change="status = $event"
      />
    </div>
    <Field label="Заметка"><input v-model="note" :class="inp" /></Field>
    <FormFooter :pending="pending" :error="error" :on-delete="onDelete" />
  </form>
</template>
