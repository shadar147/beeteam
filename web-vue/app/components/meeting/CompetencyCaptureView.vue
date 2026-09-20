<script setup lang="ts">
import { computed, ref } from "vue";
import { cn } from "~/lib/utils";
import GradeChip from "~/components/grades/GradeChip.vue";

type Grade = {
  gradeOrd: number; gradeCode: string; gradeName: string; disciplineLabel: string;
  targetOrd: number | null; targetCode: string | null; readyMonths: number;
};
type LoggedRow = { id: string; blockName: string; level: number; status: string; note: string };
type Hint = { key: string; name: string; text: string };

const props = defineProps<{
  grade: Grade | null;
  blocks: { key: string; name: string }[];
  growthHints: Hint[];
  levels: { ord: number; code: string }[];
  logged: LoggedRow[];
}>();
const emit = defineEmits<{
  add: [blockKey: string, level: number, status: string, note: string];
  remove: [id: string];
}>();

const block = ref("");
const note = ref("");

function add(level: number, status: string) {
  if (!block.value) return;
  emit("add", block.value, level, status, note.value.trim());
  block.value = "";
  note.value = "";
}

const promo = computed(
  () => props.grade != null && props.grade.targetOrd != null && props.grade.targetOrd > props.grade.gradeOrd,
);
</script>

<template>
  <p v-if="!grade" class="text-[13px] text-ink-3">У сотрудника не назначен грейд (другая карьерная лестница).</p>
  <div v-else class="space-y-3">
    <div class="flex items-center gap-2.5 rounded-lg border border-line bg-bg-tint p-2.5">
      <GradeChip :ord="grade.gradeOrd" :code="grade.gradeCode" size="sm" />
      <div class="min-w-0">
        <div class="text-[13px] font-semibold text-ink">{{ grade.gradeName }} · {{ grade.disciplineLabel }}</div>
        <div class="text-[11.5px] text-ink-3">
          {{ promo ? `цель — ${grade.targetCode} · стабильно ${grade.readyMonths} мес` : "подтверждает текущий уровень" }}
        </div>
      </div>
    </div>

    <div v-if="growthHints.length > 0" class="space-y-1.5">
      <div class="text-[11px] font-medium uppercase tracking-wide text-ink-3">Что важно увидеть для {{ grade.targetCode }}</div>
      <button
        v-for="h in growthHints"
        :key="h.key"
        type="button"
        :class="cn(
          'flex w-full items-start gap-2 rounded-md border p-2 text-left',
          block === h.key ? 'border-brand bg-brand-soft' : 'border-line hover:bg-bg-tint',
        )"
        @click="block = h.key"
      >
        <span class="text-[12.5px] font-semibold text-ink">{{ h.name }}</span>
        <span class="flex-1 text-[11.5px] text-ink-3">{{ h.text }}</span>
      </button>
    </div>

    <div class="rounded-lg border border-line p-3">
      <label for="ev-block" class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">Блок</label>
      <select
        id="ev-block"
        v-model="block"
        aria-label="Блок"
        class="mb-2 w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
      >
        <option value="">— выберите блок —</option>
        <option v-for="b in blocks" :key="b.key" :value="b.key">{{ b.name }}</option>
      </select>
      <label for="ev-note" class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">Заметка</label>
      <input
        id="ev-note"
        v-model="note"
        aria-label="Заметка"
        placeholder="Что конкретно проявил (контекст для ревью)…"
        class="mb-2 w-full rounded-md border border-line bg-bg-elev px-2 py-1.5 text-[13px] text-ink"
      >
      <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Уровень проявления</div>
      <div :class="cn('flex flex-wrap gap-1.5', !block && 'pointer-events-none opacity-40')">
        <button
          v-for="l in levels"
          :key="l.ord"
          type="button"
          :aria-label="`Отметить ${l.code}`"
          class="rounded-md border border-line p-0.5 hover:bg-bg-tint"
          @click="add(l.ord, 'demonstrated')"
        >
          <GradeChip :ord="l.ord" :code="l.code" size="sm" />
        </button>
        <button
          type="button"
          :disabled="!block"
          class="rounded-md border border-line px-2 text-[11px] text-ink-3 hover:bg-bg-tint disabled:opacity-40"
          @click="block && add(grade.gradeOrd, 'partial')"
        >
          частично
        </button>
      </div>
    </div>

    <div class="text-[11px] font-medium uppercase tracking-wide text-ink-3">Отмечено в этой встрече ({{ logged.length }})</div>
    <p v-if="logged.length === 0" class="text-[12.5px] text-ink-3">
      Пока ничего. Свидетельства накапливаются от встречи к встрече — так видно, стабильно сотрудник проявляет уровень или эпизодически.
    </p>
    <div v-else class="space-y-1.5">
      <div v-for="c in logged" :key="c.id" class="flex items-center gap-2 rounded-md border border-line p-2">
        <span :class="cn('h-2 w-2 shrink-0 rounded-full', c.status === 'partial' ? 'bg-warn' : 'bg-ok')" />
        <span class="rounded-full bg-brand-soft px-1.5 text-[10px] text-brand-text">{{ c.blockName }} · IC{{ c.level }}</span>
        <span class="flex-1 truncate text-[12.5px] text-ink-2">{{ c.note || "без заметки" }}</span>
        <button
          type="button"
          aria-label="Удалить свидетельство"
          class="text-ink-3 hover:text-ink"
          @click="emit('remove', c.id)"
        >✕</button>
      </div>
    </div>
  </div>
</template>
