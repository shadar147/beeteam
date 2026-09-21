<script setup lang="ts">
import { computed, ref } from "vue";
import { cn } from "~/lib/utils";
import Modal from "~/components/Modal.vue";
import type { AssignableLead, TeamInput, TeamRow } from "~/lib/query/teams";

const COLORS = ["#F5A524", "#3D6DCB", "#2D8F5C", "#C04A3B", "#7C5CBF", "#0E9AA7", "#D8870A", "#5B5644"];
const CADENCES: [string, string][] = [["1w", "Раз в неделю"], ["2w", "Раз в две недели"], ["4w", "Раз в месяц"]];
const VIS: [string, string][] = [["private", "Приватная"], ["hr", "HR"], ["org", "Вся компания"]];

const props = defineProps<{
  initial: TeamRow | null;
  leads: AssignableLead[];
  saving: boolean;
  error: string | null;
}>();
const emit = defineEmits<{ close: []; save: [body: TeamInput] }>();

const name = ref(props.initial?.name ?? "");
const mission = ref(props.initial?.mission ?? "");
const color = ref(props.initial?.color ?? COLORS[0]!);
const leadId = ref<string>(props.initial?.lead_id ?? "");
const cadence = ref(props.initial?.default_cadence ?? "2w");
const visibility = ref(props.initial?.visibility ?? "private");

const valid = computed(() => name.value.trim().length >= 2);
function submit() {
  if (!valid.value) return;
  emit("save", {
    name: name.value.trim(),
    mission: mission.value.trim() === "" ? null : mission.value.trim(),
    color: color.value,
    lead_id: leadId.value === "" ? null : leadId.value,
    default_cadence: cadence.value,
    visibility: visibility.value,
  });
}

const input = "w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand";
</script>

<template>
  <Modal :title="initial ? 'Редактировать команду' : 'Новая команда'" @close="emit('close')">
    <div class="flex flex-col gap-3">
      <div v-if="error" class="rounded-md border border-miss/30 bg-miss-soft p-2.5 text-[12.5px] text-miss">{{ error }}</div>
      <div>
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Название</div>
        <input v-model="name" aria-label="Название команды" :class="input" />
      </div>
      <div>
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Миссия</div>
        <input v-model="mission" aria-label="Миссия" :class="input" placeholder="Необязательно" />
      </div>
      <div>
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Цвет</div>
        <div class="flex gap-1.5">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            :aria-label="`Цвет ${c}`"
            :class="cn('h-7 w-7 rounded-md border', color === c ? 'ring-2 ring-brand ring-offset-1' : 'border-line')"
            :style="{ background: c }"
            @click="color = c"
          />
        </div>
      </div>
      <div>
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Лид</div>
        <select v-model="leadId" aria-label="Лид" :class="input">
          <option value="">— не назначен —</option>
          <option v-for="l in leads" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </div>
      <div>
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Регулярность 1-2-1</div>
        <select v-model="cadence" aria-label="Регулярность" :class="input">
          <option v-for="[v, l] in CADENCES" :key="v" :value="v">{{ l }}</option>
        </select>
      </div>
      <div>
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Видимость</div>
        <select v-model="visibility" aria-label="Видимость" :class="input">
          <option v-for="[v, l] in VIS" :key="v" :value="v">{{ l }}</option>
        </select>
      </div>
      <div class="mt-1 flex justify-end gap-2">
        <button
          type="button"
          :disabled="saving"
          class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60"
          @click="emit('close')"
        >Отмена</button>
        <button
          type="button"
          :disabled="!valid || saving"
          class="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
          @click="submit"
        >Сохранить</button>
      </div>
    </div>
  </Modal>
</template>
