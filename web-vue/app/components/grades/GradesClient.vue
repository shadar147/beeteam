<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings, Pencil, Check, X } from "lucide-vue-next";
import { cn } from "~/lib/utils";
import SegControl from "~/components/SegControl.vue";
import {
  useGradesFramework, useUpdateLevels, usePutDiscipline, useCreateDiscipline, useUpdateBands,
  type Discipline, type PutDiscipline as PutDisciplineBody,
} from "~/lib/query/grades";
import GradeLevels from "./GradeLevels.vue";
import GradeMatrix from "./GradeMatrix.vue";
import GradeBands from "./GradeBands.vue";
import LevelsEditor from "./LevelsEditor.vue";
import MatrixEditor from "./MatrixEditor.vue";
import CellEditor from "./CellEditor.vue";
import NewDisciplineModal from "./NewDisciplineModal.vue";
import BandsEditor from "./BandsEditor.vue";
import { emptyCells, bandsDraftValid, type Draft, type DraftBlock, type DraftLevel, type BandsDraft, type DraftBand } from "./editorTypes";

type Tab = "levels" | "matrix" | "bands";

const DISC_ICONS: Record<string, Component> = {
  fields: SlidersHorizontal, layers: Layers, spark: Sparkles, check: CircleCheck, settings: Settings,
};
const ICON_KEYS = ["layers", "fields", "spark", "check", "settings"] as const;

function snapshot(disc: Discipline, levels: DraftLevel[]): Draft {
  const blocks: DraftBlock[] = [...disc.blocks]
    .sort((a, b) => a.ord - b.ord)
    .map((b) => ({
      id: b.id,
      key: b.key,
      name: b.name,
      cells: Array.from({ length: 7 }, (_, i) => {
        const c = b.cells.find((x) => x.level === i + 1);
        return { level: i + 1, text: c?.text ?? null, required: c?.required ?? true };
      }),
    }));
  return { discId: disc.id, label: disc.label, icon: disc.icon, description: disc.description, blocks, levels, levelsDirty: false };
}

defineProps<{ canEdit: boolean; canEditBands: boolean }>();

const fw = useGradesFramework();
const updateLevels = useUpdateLevels();
const putDiscipline = usePutDiscipline();
const createDiscipline = useCreateDiscipline();
const updateBands = useUpdateBands();
const { isLoading, isError } = fw;
const creating = createDiscipline.isPending;

const disc = ref<string | null>(null);
const tab = ref<Tab>("matrix");
const draft = ref<Draft | null>(null);
const bandsDraft = ref<BandsDraft | null>(null);
const openCell = ref<{ blockIdx: number; levelOrd: number } | null>(null);
const newDisc = ref(false);
const error = ref<string | null>(null);

const levels = computed(() => fw.data.value?.levels ?? []);
const disciplines = computed(() => fw.data.value?.disciplines ?? []);
const taxRate = computed(() => fw.data.value?.tax_rate);
const editing = computed(() => draft.value !== null);
const editingBands = computed(() => bandsDraft.value !== null);
const activeKey = computed(() => disc.value ?? disciplines.value[0]?.key);
const active = computed(() => disciplines.value.find((d) => d.key === activeKey.value) ?? disciplines.value[0]!);
const sortedLevels = computed(() => [...levels.value].sort((a, b) => a.ord - b.ord));

function enterEdit() {
  const lv: DraftLevel[] = sortedLevels.value.map((l) => ({
    ord: l.ord, code: l.code, name: l.name, exp: l.exp, autonomy: l.autonomy, scope: l.scope,
  }));
  draft.value = snapshot(active.value, lv);
  tab.value = "matrix";
  error.value = null;
}
function cancelEdit() { draft.value = null; error.value = null; }

function enterBandsEdit() {
  bandsDraft.value = {
    taxPct: Math.round((fw.data.value!.tax_rate ?? 0) * 100),
    levels: sortedLevels.value.map((l): DraftBand => ({
      ord: l.ord, code: l.code, name: l.name,
      band_low: l.band_low ?? 0, band_mid: l.band_mid ?? 0, band_high: l.band_high ?? 0,
    })),
  };
  tab.value = "bands";
  error.value = null;
}
function cancelBandsEdit() { bandsDraft.value = null; error.value = null; }
function setBand(ord: number, patch: Partial<DraftBand>) {
  const d = bandsDraft.value;
  if (d) bandsDraft.value = { ...d, levels: d.levels.map((l) => (l.ord === ord ? { ...l, ...patch } : l)) };
}
function setTax(pct: number) {
  const d = bandsDraft.value;
  if (d) bandsDraft.value = { ...d, taxPct: pct };
}
async function saveBands() {
  const d = bandsDraft.value;
  if (!d) return;
  error.value = null;
  try {
    await updateBands.mutateAsync({
      tax_rate: d.taxPct / 100,
      levels: d.levels.map((l) => ({
        ord: l.ord, band_low: l.band_low, band_mid: l.band_mid, band_high: l.band_high,
      })),
    });
    bandsDraft.value = null;
  } catch {
    error.value = "Не удалось сохранить вилки. Проверьте значения и попробуйте ещё раз.";
  }
}
const bandsBusy = updateBands.isPending;
const bandsValid = computed(() => (bandsDraft.value ? bandsDraftValid(bandsDraft.value) : false));

async function save() {
  const d = draft.value;
  if (!d) return;
  error.value = null;
  try {
    if (d.levelsDirty) {
      await updateLevels.mutateAsync({
        levels: d.levels.map((l) => ({ ord: l.ord, name: l.name, exp: l.exp, autonomy: l.autonomy, scope: l.scope })),
      });
    }
    const body: PutDisciplineBody = {
      label: d.label, icon: d.icon, description: d.description,
      blocks: d.blocks.map((b) => ({
        id: b.id, name: b.name,
        cells: b.cells.map((c) => ({ level_ord: c.level, text: c.text, required: c.required })),
      })),
    };
    await putDiscipline.mutateAsync({ id: d.discId, body });
    draft.value = null;
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status;
    error.value = status === 409
      ? "Нельзя удалить блок, по которому уже есть данные сотрудников. Верните блок и сохраните снова."
      : "Не удалось сохранить изменения. Попробуйте ещё раз.";
  }
}

// draft mutators
function patchDraft(fn: (d: Draft) => Draft) {
  if (draft.value) draft.value = fn(draft.value);
}
const setMeta = (patch: Partial<Pick<Draft, "label" | "icon" | "description">>) =>
  patchDraft((d) => ({ ...d, ...patch }));
const setLevel = (ord: number, patch: Partial<DraftLevel>) =>
  patchDraft((d) => ({ ...d, levelsDirty: true, levels: d.levels.map((l) => (l.ord === ord ? { ...l, ...patch } : l)) }));
const renameBlock = (i: number, name: string) =>
  patchDraft((d) => ({ ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, name } : b)) }));
const moveBlock = (from: number, to: number) =>
  patchDraft((d) => {
    if (to < 0 || to >= d.blocks.length) return d;
    const blocks = d.blocks.slice();
    [blocks[from], blocks[to]] = [blocks[to]!, blocks[from]!];
    return { ...d, blocks };
  });
const deleteBlock = (i: number) =>
  patchDraft((d) => ({ ...d, blocks: d.blocks.filter((_, j) => j !== i) }));
const addBlock = () =>
  patchDraft((d) => ({ ...d, blocks: [...d.blocks, { id: null, key: "", name: "Новый блок", cells: emptyCells() }] }));
const applyCell = (blockIdx: number, levelOrd: number, cell: { text: string | null; required: boolean }) =>
  patchDraft((d) => ({
    ...d,
    blocks: d.blocks.map((b, j) => j !== blockIdx ? b : {
      ...b, cells: b.cells.map((c) => (c.level === levelOrd ? { ...c, text: cell.text, required: cell.required } : c)),
    }),
  }));

const busy = computed(() => updateLevels.isPending.value || putDiscipline.isPending.value);

const segOptions = computed(() => editing.value
  ? [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }]
  : [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]);
const segValue = computed(() => (editingBands.value ? "bands" : tab.value === "bands" && editing.value ? "matrix" : tab.value));
function onTab(v: string) {
  if (!editingBands.value) tab.value = v as Tab;
}

const openCellCtx = computed(() => {
  const d = draft.value;
  const oc = openCell.value;
  if (!d || !oc) return null;
  const block = d.blocks[oc.blockIdx]!;
  const lvl = d.levels.find((l) => l.ord === oc.levelOrd)!;
  const cell = block.cells.find((c) => c.level === oc.levelOrd)!;
  return { ...oc, blockName: block.name, levelCode: lvl.code, levelName: lvl.name, initial: cell.text };
});

async function onCreate(b: { label: string; icon: string; description: string; copy_from_discipline_id: string }) {
  try {
    const created = await createDiscipline.mutateAsync(b);
    newDisc.value = false;
    draft.value = null;        // leave edit mode; the new discipline is now in the framework
    disc.value = created.key;  // switch to it
  } catch {
    error.value = "Не удалось создать дисциплину.";
  }
}
</script>

<template>
  <div v-if="isLoading" class="p-6 text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="isError" class="p-6">
    <div class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
      Не удалось загрузить грейды.{{ " " }}
      <button class="underline" @click="fw.refetch()">Повторить</button>
    </div>
  </div>
  <div v-else-if="disciplines.length === 0" class="p-6 text-center text-[14px] text-ink-3">Карта грейдов пока не настроена</div>
  <div v-else class="p-6">
    <div class="mb-[18px] flex items-start justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-[20px] font-semibold text-ink">
          Грейды
          <span v-if="editing" class="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">режим редактирования</span>
          <span v-if="editingBands" class="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">редактирование вилок</span>
        </h1>
        <p class="text-[13px] text-ink-3 tabular">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <button
          v-if="!editing && !editingBands && canEdit"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
          @click="enterEdit"
        >
          <Pencil :size="14" /> Редактировать
        </button>
        <button
          v-if="!editing && !editingBands && tab === 'bands' && canEditBands"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
          @click="enterBandsEdit"
        >
          <Pencil :size="14" /> Редактировать вилки
        </button>
        <template v-if="editing">
          <button
            type="button"
            :disabled="busy"
            class="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60"
            @click="cancelEdit"
          >
            <X :size="14" /> Отмена
          </button>
          <button
            type="button"
            :disabled="busy"
            class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
            @click="save"
          >
            <Check :size="14" /> Сохранить
          </button>
        </template>
        <template v-if="editingBands">
          <button
            type="button"
            :disabled="bandsBusy"
            class="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60"
            @click="cancelBandsEdit"
          >
            <X :size="14" /> Отмена
          </button>
          <button
            type="button"
            :disabled="bandsBusy || !bandsValid"
            class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
            @click="saveBands"
          >
            <Check :size="14" /> Сохранить
          </button>
        </template>
      </div>
    </div>

    <div v-if="error" class="mb-4 rounded-lg border border-miss/30 bg-miss-soft p-3 text-[12.5px] text-miss">{{ error }}</div>

    <!-- discipline cards -->
    <div class="mb-[18px] grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))">
      <button
        v-for="d in disciplines"
        :key="d.key"
        type="button"
        :disabled="(editing || editingBands) && d.key !== activeKey"
        :class="cn(
          'flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors',
          d.key === activeKey ? 'border-brand bg-brand-soft ring-[3px] ring-brand/10' : 'border-line bg-bg-elev hover:bg-bg-tint',
          (editing || editingBands) && d.key !== activeKey && 'opacity-40',
        )"
        @click="!editing && !editingBands && (disc = d.key)"
      >
        <span
          :class="cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]',
            d.key === activeKey ? 'bg-brand text-[#1A1100]' : 'bg-bg-tint text-ink-3')"
        >
          <component :is="DISC_ICONS[d.icon] ?? Layers" :size="16" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-[13.5px] font-semibold tracking-tight text-ink">{{ d.label }}</span>
          <span v-if="d.description" class="block text-[11px] leading-snug text-ink-3">{{ d.description }}</span>
        </span>
      </button>
      <button
        v-if="editing"
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line p-3 text-[13px] text-ink-3 hover:bg-bg-tint"
        @click="newDisc = true"
      >
        + Новая дисциплина
      </button>
    </div>

    <!-- discipline meta editor -->
    <div v-if="draft" class="mb-4 rounded-xl border border-line bg-bg-elev p-4">
      <div class="mb-2 text-[11px] uppercase tracking-wide text-ink-3">Дисциплина</div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1.5">
          <button
            v-for="k in ICON_KEYS"
            :key="k"
            type="button"
            :aria-label="`Иконка ${k}`"
            :class="cn('grid h-8 w-8 place-items-center rounded-lg border',
              draft.icon === k ? 'border-brand bg-brand-soft text-brand-text' : 'border-line text-ink-3 hover:bg-bg-tint')"
            @click="setMeta({ icon: k })"
          >
            <component :is="DISC_ICONS[k]" :size="15" />
          </button>
        </div>
        <input
          aria-label="Название дисциплины"
          :value="draft.label"
          class="min-w-[160px] flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-brand"
          @input="setMeta({ label: ($event.target as HTMLInputElement).value })"
        />
        <input
          aria-label="Описание дисциплины"
          :value="draft.description"
          placeholder="Описание"
          class="min-w-[200px] flex-[2] rounded-md border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand"
          @input="setMeta({ description: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-end gap-3">
      <SegControl :options="segOptions" :value="segValue" @change="onTab" />
    </div>

    <template v-if="draft">
      <LevelsEditor v-if="tab === 'levels'" :levels="draft.levels" @change="setLevel" />
      <MatrixEditor
        v-else
        :blocks="draft.blocks"
        :levels="draft.levels"
        @rename="renameBlock"
        @move="moveBlock"
        @delete="deleteBlock"
        @add="addBlock"
        @open-cell="(blockIdx, levelOrd) => (openCell = { blockIdx, levelOrd })"
      />
    </template>
    <BandsEditor v-else-if="bandsDraft" :levels="bandsDraft.levels" :tax-pct="bandsDraft.taxPct" @band="setBand" @tax="setTax" />
    <GradeLevels v-else-if="tab === 'levels'" :levels="levels" />
    <GradeBands v-else-if="tab === 'bands'" :levels="levels" :tax-rate="taxRate" />
    <GradeMatrix v-else :discipline="active" :levels="levels" />

    <CellEditor
      v-if="openCellCtx"
      :block-name="openCellCtx.blockName"
      :level-code="openCellCtx.levelCode"
      :level-name="openCellCtx.levelName"
      :initial="openCellCtx.initial"
      @apply="(c) => applyCell(openCellCtx!.blockIdx, openCellCtx!.levelOrd, c)"
      @close="openCell = null"
    />

    <NewDisciplineModal
      v-if="editing && newDisc"
      :bases="disciplines.map((d) => ({ id: d.id, label: d.label }))"
      :creating="creating"
      @close="newDisc = false"
      @create="onCreate"
    />
  </div>
</template>
