<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMeeting, useMemberFiles } from "~/lib/query/profile";
import {
  useTemplate, useMeetingAutosave, useCompleteMeeting, useDeleteMeeting, type FieldDef,
} from "~/lib/query/meetings";
import {
  formFromMeeting, formToPatch, meetingFormReducer, toLocalInput, fromLocalInput, type MeetingForm,
} from "~/lib/meeting-form";
import { downloadFile, useDeleteFile } from "~/lib/query/files";
import FileDropzone from "~/components/FileDropzone.vue";
import CompetencyCapture from "~/components/meeting/CompetencyCapture.vue";
import FieldControl from "~/components/FieldControl.vue";
import Pill from "~/components/Pill.vue";

// template field title → MeetingForm key
const TITLE_TO_FIELD: Record<string, keyof MeetingForm> = {
  "Настроение": "mood",
  "Блокеры": "blockers",
  "Цели": "goals",
  "Фидбек сотруднику": "feedback_to",
  "Фидбек от сотрудника": "feedback_from",
  "Развитие": "development",
  "Отношения": "relationships",
};

const EMPTY: MeetingForm = {
  date: "", duration_min: 45, mood: "", mood_score: null, blockers: "", goals: "",
  feedback_to: "", feedback_from: "", development: "", relationships: "",
};

const props = defineProps<{ meetingId: string }>();
const emit = defineEmits<{ close: [] }>();

const meeting = useMeeting(() => props.meetingId);
const template = useTemplate(() => meeting.data.value?.template_id ?? null);
const memberId = computed(() => meeting.data.value?.member_id ?? "");
const autosave = useMeetingAutosave(() => props.meetingId, memberId);
const complete = useCompleteMeeting();
const del = useDeleteMeeting();
const memberFiles = useMemberFiles(memberId);
const delFile = useDeleteFile(memberId);
const attachments = computed(() =>
  (memberFiles.data.value ?? []).filter((f) => f.meeting_id === props.meetingId),
);

const form = ref<MeetingForm>(EMPTY);
const actionError = ref<string | null>(null);

// Seed the form once the meeting loads.
watch(
  () => meeting.data.value,
  (data) => {
    if (data) form.value = formFromMeeting(data);
  },
  { immediate: true },
);

function edit(field: keyof MeetingForm, value: string | number | null) {
  form.value = meetingFormReducer(form.value, { type: "set", field, value });
  autosave.schedule(formToPatch(form.value));
}

function editMany(updates: Partial<MeetingForm>) {
  form.value = { ...form.value, ...updates };
  autosave.schedule(formToPatch(form.value));
}

const done = computed(() => meeting.data.value?.state === "done");
const saveStatus = computed(() => autosave.status.value);

function fieldKey(f: FieldDef): keyof MeetingForm | undefined {
  return TITLE_TO_FIELD[f.title];
}
function fieldValue(f: FieldDef): string {
  if (f.kind === "mood") return form.value.mood;
  const key = fieldKey(f);
  return key ? String(form.value[key] ?? "") : "";
}
function onFieldChange(f: FieldDef, v: string) {
  const key = fieldKey(f);
  if (key) edit(key, v);
}

function flushAndClose() {
  autosave.flush();
  emit("close");
}

function onComplete() {
  actionError.value = null;
  autosave.flush();
  complete.mutate(props.meetingId, {
    onSuccess: () => emit("close"),
    onError: () => { actionError.value = "Не удалось завершить встречу"; },
  });
}

function onCancel() {
  if (confirm("Удалить встречу?")) {
    actionError.value = null;
    del.mutate({ id: props.meetingId, memberId: memberId.value }, {
      onSuccess: () => emit("close"),
      onError: () => { actionError.value = "Не удалось удалить встречу"; },
    });
  }
}

function onDeleteFile(id: string) {
  if (confirm("Удалить файл?")) delFile.mutate(id);
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end">
    <button aria-label="Закрыть" class="flex-1 bg-black/30 backdrop-blur-sm" @click="flushAndClose" />
    <aside class="flex h-full w-[92vw] max-w-[720px] flex-col bg-bg-elev shadow-pop">
      <header class="flex items-center justify-between border-b border-line px-5 py-3">
        <div class="flex items-center gap-2">
          <Pill :variant="done ? 'ok' : 'info'" dot>{{ done ? "Завершена" : "Запланирована" }}</Pill>
          <span class="text-[12px] text-ink-3" :data-save-status="saveStatus">
            {{ saveStatus === "saving" ? "● Сохранение…" : saveStatus === "error" ? "● Не сохранено" : saveStatus === "saved" ? "● Сохранено" : "" }}
          </span>
        </div>
        <button type="button" class="text-ink-3 hover:text-ink" @click="flushAndClose">✕</button>
      </header>

      <div v-if="!done && form.date" class="flex items-center gap-2 border-b border-line px-5 py-2 text-[12px] text-ink-3">
        <span>Перенести:</span>
        <input
          type="datetime-local"
          aria-label="Дата встречи"
          :value="toLocalInput(form.date)"
          class="rounded-md border border-line bg-bg-elev px-2 py-1 text-[12px] text-ink tabular"
          @input="edit('date', fromLocalInput(($event.target as HTMLInputElement).value))"
        >
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-3">
        <div v-if="meeting.isLoading.value || template.isLoading.value" class="text-[13px] text-ink-3">Загрузка…</div>
        <div v-else-if="meeting.isError.value" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
          Не удалось загрузить встречу.
          <button class="underline" @click="meeting.refetch()">Повторить</button>
        </div>
        <template v-else>
          <FieldControl
            v-for="f in template.data.value?.fields ?? []"
            :key="f.id"
            :field="f"
            :value="fieldValue(f)"
            :mood-score="form.mood_score"
            @change="(v) => onFieldChange(f, v)"
            @mood="(emoji, score) => editMany({ mood: emoji, mood_score: score })"
          />
          <div class="mt-4 border-t border-line pt-3">
            <div class="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Вложения</div>
            <p v-if="attachments.length === 0" class="text-[12px] text-ink-3">Вложений нет</p>
            <ul v-else class="mb-2 space-y-1">
              <li v-for="f in attachments" :key="f.id" class="flex items-center gap-2 text-[13px] text-ink-2">
                <button type="button" class="truncate text-left hover:underline" @click="downloadFile(f.id).catch(() => {})">{{ f.name }}</button>
                <button
                  type="button"
                  aria-label="Удалить"
                  class="ml-auto text-ink-3 hover:text-ink"
                  @click="onDeleteFile(f.id)"
                >✕</button>
              </li>
            </ul>
            <FileDropzone
              v-if="meeting.data.value"
              :member-id="meeting.data.value.member_id"
              :meeting-id="meetingId"
              @uploaded="memberFiles.refetch()"
            />
          </div>
          <div v-if="meeting.data.value" class="mt-4 border-t border-line pt-3">
            <div class="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Проявленные компетенции</div>
            <CompetencyCapture :member-id="meeting.data.value.member_id" :meeting-id="meetingId" />
          </div>
        </template>
      </div>

      <div v-if="actionError" class="border-t border-miss/30 bg-miss-soft px-5 py-2 text-[12px] text-miss">{{ actionError }}</div>
      <footer class="flex gap-2 border-t border-line px-5 py-3">
        <button
          v-if="!done"
          type="button"
          class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
          @click="onComplete"
        >
          Завершить
        </button>
        <button
          v-if="!done"
          type="button"
          class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
          @click="onCancel"
        >
          Отменить
        </button>
        <button type="button" class="ml-auto rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2" @click="flushAndClose">
          Закрыть
        </button>
      </footer>
    </aside>
  </div>
</template>
