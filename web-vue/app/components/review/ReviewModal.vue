<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Flag, Layers, Scale, Award, Check, ArrowRight, Trash2, Undo2 } from "lucide-vue-next";
import { cn } from "~/lib/utils";
import Avatar from "~/components/Avatar.vue";
import { useGradesFramework } from "~/lib/query/grades";
import { useMemberGrade } from "~/lib/query/member-grade";
import { useMemberEvidence } from "~/lib/query/evidence";
import {
  type Review, useReviewAutosave, useUpdateReview, useFinalizeReview, useDeleteReview, useReviewCalibration,
} from "~/lib/query/reviews";
import ReviewPrep from "./ReviewPrep.vue";
import ReviewAssess, { type AssessBlock } from "./ReviewAssess.vue";
import ReviewCalibrate, { type CalibRow } from "./ReviewCalibrate.vue";
import ReviewDecision, { type Decision } from "./ReviewDecision.vue";

const STEPS = [
  { id: "prep", label: "Подготовка", icon: Flag },
  { id: "assess", label: "Оценка по блокам", icon: Layers },
  { id: "calibrate", label: "Калибровка", icon: Scale },
  { id: "decision", label: "Решение", icon: Award },
] as const;

const props = defineProps<{
  memberId: string;
  memberName: string;
  memberHue: number;
  review: Review;
}>();
const emit = defineEmits<{ close: [] }>();

const fw = useGradesFramework();
const mg = useMemberGrade(() => props.memberId);
const ev = useMemberEvidence(() => props.memberId);
const calib = useReviewCalibration(() => props.review.id);
const autosave = useReviewAutosave(() => props.review.id, () => props.memberId);
const update = useUpdateReview(() => props.review.id, () => props.memberId);
const finalize = useFinalizeReview(() => props.memberId);
const del = useDeleteReview(() => props.memberId);
const saveStatus = autosave.status;

const step = ref(0);
const finishError = ref(false);
// Local wizard state is seeded once from the draft, like React's useState initialisers.
const leads = ref<Record<string, number>>(
  Object.fromEntries(props.review.scores.map((s) => [s.block_id, s.lead_ord])),
);
const decision = ref<Decision | null>((props.review.decision as Decision) ?? null);
const summary = ref(props.review.summary);

function flushAndClose() {
  autosave.flush();
  emit("close");
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") flushAndClose();
}
onMounted(() => document.addEventListener("keydown", onKey));
onUnmounted(() => document.removeEventListener("keydown", onKey));

const loading = computed(() => fw.isLoading.value || mg.isLoading.value || ev.isLoading.value);
const grade = computed(() => mg.data.value);
const framework = computed(() => fw.data.value);
const discipline = computed(() =>
  framework.value?.disciplines.find((d) => d.key === grade.value?.discipline_key),
);
const levels = computed(() =>
  framework.value ? [...framework.value.levels].sort((a, b) => a.ord - b.ord) : [],
);
const codeOf = (ord: number | null | undefined) =>
  ord != null ? levels.value.find((l) => l.ord === ord)?.code ?? `IC${ord}` : "";

const evidence = computed(() => ev.data.value ?? []);
const targetOrd = computed(() => props.review.target_ord ?? null);
const fromCode = computed(() => codeOf(props.review.from_grade_ord));
const targetCode = computed(() => (targetOrd.value != null ? codeOf(targetOrd.value) : null));
const promo = computed(() => targetOrd.value != null && targetOrd.value > props.review.from_grade_ord);

const blocks = computed<AssessBlock[]>(() =>
  (discipline.value?.blocks ?? []).map((b) => {
    const score = props.review.scores.find((s) => s.block_key === b.key)!;
    return {
      blockId: score.block_id,
      name: b.name,
      selfOrd: score.self_ord ?? null,
      leadOrd: leads.value[score.block_id] ?? score.lead_ord,
      evidenceCount: evidence.value.filter((e) => e.block_key === b.key).length,
      descByLevel: levels.value.map((l) => b.cells.find((c) => c.level === l.ord)?.text ?? null),
    };
  }),
);
const avgLead = computed(() => {
  const leadVals = blocks.value.map((b) => b.leadOrd);
  return leadVals.reduce((a, v) => a + v, 0) / Math.max(leadVals.length, 1);
});
const meetsNext = computed(() => {
  const t = targetOrd.value;
  return t != null ? blocks.value.filter((b) => b.leadOrd >= t).length : 0;
});

const calibRows = computed<CalibRow[]>(() => [
  { id: props.memberId, name: props.memberName, hue: props.memberHue, avg: avgLead.value, me: true, promo: promo.value },
  ...(calib.data.value ?? []).map((p) => ({
    id: p.member_id, name: p.name, hue: p.hue, avg: p.avg_level, me: false,
    promo: p.target_ord != null && p.target_ord > props.review.from_grade_ord,
  })),
]);

const selfRows = computed(() =>
  props.review.scores.map((s) => ({ name: s.block_name, ord: s.self_ord ?? null, code: codeOf(s.self_ord) })),
);
const lowBlocks = computed(() =>
  blocks.value.filter((b) => b.leadOrd < props.review.from_grade_ord).map((b) => b.name),
);

const scoresPatch = () =>
  Object.entries(leads.value).map(([block_id, lead_ord]) => ({ block_id, lead_ord }));

function setLead(blockId: string, ord: number) {
  leads.value = { ...leads.value, [blockId]: ord };
  autosave.schedule({ scores: scoresPatch() });
}
function onDecision(d: Decision) {
  decision.value = d;
  autosave.schedule({ decision: d });
}
function onSummary(s: string) {
  summary.value = s;
  autosave.schedule({ summary: s });
}

async function finish() {
  // The direct save below carries the full state, so the queued debounce patch
  // is redundant — cancel it to avoid a stray PATCH landing after finalize.
  autosave.cancel();
  finishError.value = false;
  try {
    await update.mutateAsync({ scores: scoresPatch(), decision: decision.value ?? undefined, summary: summary.value });
    await finalize.mutateAsync(props.review.id);
    emit("close");
  } catch {
    finishError.value = true;
  }
}
function cancelDraft() {
  if (window.confirm("Удалить черновик ревью? Оценки и резюме будут потеряны.")) {
    del.mutate(props.review.id, { onSuccess: () => emit("close") });
  }
}

const hints = computed(() => [
  `Самооценка ${props.review.scores.some((s) => s.self_ord != null) ? "получена" : "не получена"} · ${evidence.value.length} свидетельств в истории`,
  targetCode.value ? `${meetsNext.value}/${blocks.value.length} блоков на уровне ${targetCode.value}` : "Подтверждение текущего уровня",
  "Сравнение с сотрудниками того же грейда",
  "После сохранения решение уйдёт на согласование HR",
]);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Nothing can be queued before the data loads, so flushing on every close path is safe. -->
    <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="flushAndClose" />
    <div
      role="dialog"
      aria-label="Performance Review"
      class="relative z-10 w-full max-w-[1040px] rounded-xl border border-line bg-bg-elev shadow-pop"
    >
      <div v-if="loading" class="p-10 text-[13px] text-ink-3">Загрузка…</div>
      <div v-else-if="!grade || !discipline || !framework" class="p-10 text-[13px] text-miss">Не удалось загрузить данные грейда.</div>
      <template v-else>
        <!-- header -->
        <div class="flex items-center justify-between border-b border-line px-6 py-4">
          <div class="flex items-center gap-3">
            <Avatar :name="memberName" :hue="memberHue" size="md" />
            <div>
              <div class="text-[15px] font-semibold text-ink">Performance Review · {{ memberName }}</div>
              <div class="text-[12px] text-ink-3">
                {{ review.period }} · {{ discipline.label }} · {{ fromCode }}<template v-if="promo && targetCode"> · цель {{ targetCode }}</template>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-[12px] text-ink-3" :data-save-status="saveStatus">
              {{ saveStatus === "saving" ? "● Сохранение…" : saveStatus === "error" ? "● Не сохранено" : saveStatus === "saved" ? "● Сохранено" : "" }}
            </span>
            <button type="button" aria-label="Закрыть" class="text-ink-3 hover:text-ink" @click="flushAndClose">✕</button>
          </div>
        </div>

        <!-- step rail -->
        <div class="flex gap-1 border-b border-line px-6 py-2.5">
          <button
            v-for="(s, i) in STEPS"
            :key="s.id"
            type="button"
            :data-active="step === i"
            :class="cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px]',
              step === i ? 'bg-brand-soft font-semibold text-ink' : 'text-ink-3 hover:bg-bg-tint',
            )"
            @click="step = i"
          >
            <span
              :class="cn(
                'grid h-5 w-5 place-items-center rounded-full border',
                step > i ? 'border-ok bg-ok-soft text-ok' : 'border-line text-ink-3',
              )"
            >
              <Check v-if="step > i" :size="12" />
              <component :is="s.icon" v-else :size="12" />
            </span>
            {{ s.label }}
          </button>
        </div>

        <!-- body -->
        <div class="max-h-[62vh] overflow-y-auto px-6 py-5">
          <div
            v-if="review.status === 'draft' && review.hr_comment"
            class="mb-4 flex items-start gap-2.5 rounded-lg border border-brand/40 bg-brand-soft p-3 text-[12.5px] text-ink-2"
          >
            <Undo2 :size="15" class="mt-0.5 shrink-0 text-brand-strong" />
            <div>
              <b>Возвращено HR:</b> {{ review.hr_comment }}
            </div>
          </div>
          <ReviewPrep
            v-if="step === 0"
            :grade-code="fromCode"
            :target-code="targetCode"
            :promo="promo"
            :ready-months="grade.ready_months"
            :self-rows="selfRows"
            :evidence="evidence"
          />
          <ReviewAssess v-if="step === 1" :blocks="blocks" :levels="levels" :target-ord="targetOrd" @set-lead="setLead" />
          <ReviewCalibrate
            v-if="step === 2"
            :rows="calibRows"
            :grade-code="fromCode"
            :target-code="targetCode"
            :target-ord="targetOrd"
            :discipline-label="discipline.label"
            :levels="levels"
            :avg-lead="avgLead"
          />
          <ReviewDecision
            v-if="step === 3"
            :grade-ord="review.from_grade_ord"
            :grade-code="fromCode"
            :next-code="codeOf(Math.min(review.from_grade_ord + 1, 7))"
            :decision="decision"
            :summary="summary"
            :compa="grade.compa"
            :low-blocks="lowBlocks"
            @decision="onDecision"
            @summary="onSummary"
          />
        </div>

        <!-- footer -->
        <div class="flex items-center justify-between border-t border-line px-6 py-3.5">
          <div class="flex items-center gap-4 text-[12px] text-ink-3">
            <span>{{ hints[step] }}</span>
            <span v-if="finishError" class="text-miss">Не удалось завершить ревью — попробуйте ещё раз.</span>
            <button
              v-if="step === 0"
              type="button"
              class="inline-flex items-center gap-1 text-ink-4 hover:text-miss"
              @click="cancelDraft"
            >
              <Trash2 :size="12" /> Удалить черновик
            </button>
          </div>
          <div class="flex gap-2">
            <button
              v-if="step > 0"
              type="button"
              class="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint"
              @click="step = step - 1"
            >
              Назад
            </button>
            <button
              v-if="step < 3"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
              @click="step = step + 1"
            >
              Далее <ArrowRight :size="14" />
            </button>
            <button
              v-else
              type="button"
              :disabled="decision == null || update.isPending.value || finalize.isPending.value"
              class="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
              @click="finish"
            >
              <Check :size="14" /> Завершить ревью
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
