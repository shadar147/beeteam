<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useGradesFramework } from "~/lib/query/grades";
import { useMemberGrade } from "~/lib/query/member-grade";
import GradeHero from "~/components/grades/GradeHero.vue";
import BlockProfile from "~/components/grades/BlockProfile.vue";
import GrowChecklist from "~/components/grades/GrowChecklist.vue";
import CompaBand from "~/components/grades/CompaBand.vue";
import EvidenceTimeline from "~/components/grades/EvidenceTimeline.vue";
import GradeEmptyState from "~/components/grades/GradeEmptyState.vue";
import { useMemberEvidence } from "~/lib/query/evidence";
import { useMemberReviews, useStartReview } from "~/lib/query/reviews";
import { useMemberDetail } from "~/lib/query/profile";
import ReviewHistory from "~/components/grades/ReviewHistory.vue";
import ReviewModal from "~/components/review/ReviewModal.vue";

const props = defineProps<{ memberId: string }>();

const fw = useGradesFramework();
const mg = useMemberGrade(() => props.memberId);
const ev = useMemberEvidence(() => props.memberId);
const reviews = useMemberReviews(() => props.memberId);
const detail = useMemberDetail(() => props.memberId);
const start = useStartReview(() => props.memberId);
const reviewOpen = ref(false);

const isLoading = computed(() => fw.isLoading.value || mg.isLoading.value || ev.isLoading.value);
const isError = computed(() => fw.isError.value || mg.isError.value || ev.isError.value);

const grade = computed(() => mg.data.value ?? null);
const discipline = computed(
  () => fw.data.value?.disciplines.find((d) => d.key === grade.value?.discipline_key) ?? null,
);
const member = computed(() => detail.data.value);

const levels = computed(() => [...(fw.data.value?.levels ?? [])].sort((a, b) => a.ord - b.ord));
const levelByOrd = (ord: number) => levels.value.find((l) => l.ord === ord);
const cur = computed(() => levelByOrd(grade.value!.grade_ord)!);
const target = computed(() => {
  const ord = grade.value?.target_ord;
  return ord != null ? levelByOrd(ord) ?? null : null;
});

const blockLevelOf = (blockKey: string) =>
  grade.value!.block_levels.find((bl) => bl.block_key === blockKey)?.level_ord ?? grade.value!.grade_ord;

const blocks = computed(() => discipline.value!.blocks.map((b) => ({ name: b.name, cur: blockLevelOf(b.key) })));

const reviewList = computed(() => reviews.data.value ?? []);
const activeDraft = computed(() => reviewList.value.find((r) => r.status === "draft") ?? null);
const activePending = computed(() => reviewList.value.find((r) => r.status === "pending") ?? null);
function openReview() {
  if (activeDraft.value) {
    reviewOpen.value = true;
    return;
  }
  start.mutate(undefined, { onSuccess: () => { reviewOpen.value = true; } });
}
const modalReview = computed(() => activeDraft.value ?? start.data.value ?? null);
// The modal's "close" emit is dropped if finalize unmounts it first (the draft leaves
// member-reviews); without this the modal would reopen when HR returns the review.
watch(modalReview, (r) => { if (!r) reviewOpen.value = false; });
const codeOf = (ord: number) => levels.value.find((l) => l.ord === ord)?.code ?? `IC${ord}`;

const evidence = computed(() => ev.data.value ?? []);
const growItemsWithCount = computed(() => {
  const targetOrd = grade.value!.target_ord;
  if (targetOrd == null) return [];
  return discipline.value!.blocks
    .filter((b) => blockLevelOf(b.key) < targetOrd)
    .map((b) => ({ key: b.key, blockName: b.name, text: b.cells.find((c) => c.level === targetOrd)?.text ?? "" }))
    .filter((it) => it.text.length > 0)
    .map((it) => ({
      blockName: it.blockName,
      targetCode: target.value?.code ?? "",
      text: it.text,
      evidenceCount: evidence.value.filter((e) => e.block_key === it.key && e.level_ord >= targetOrd).length,
    }));
});
</script>

<template>
  <div v-if="isLoading" class="text-[13px] text-ink-3">Загрузка…</div>
  <div v-else-if="isError" class="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">Не удалось загрузить грейд.</div>
  <GradeEmptyState v-else-if="!grade || !discipline" />
  <div v-else class="grid gap-4 lg:grid-cols-2">
    <div class="space-y-4 lg:col-span-2">
      <GradeHero
        :grade-ord="grade.grade_ord"
        :grade-code="cur.code"
        :grade-name="cur.name"
        :discipline-label="discipline.label"
        :target-ord="grade.target_ord ?? null"
        :target-code="target?.code ?? null"
        :target-name="target?.name ?? null"
        :ready-months="grade.ready_months"
        :mgr-track="grade.mgr_track"
        :next-review="grade.next_review ?? null"
        :last-review="grade.last_review ?? null"
        :active-review="activePending ? 'pending' : activeDraft ? 'draft' : null"
        :returned="Boolean(activeDraft && activeDraft.hr_comment)"
        :on-open-review="activePending ? undefined : openReview"
      />
    </div>
    <div class="space-y-4">
      <BlockProfile :blocks="blocks" :grade-ord="grade.grade_ord" :target-ord="grade.target_ord ?? null" :level-count="levels.length" />
      <GrowChecklist v-if="target" :items="growItemsWithCount" :target-code="target.code" />
    </div>
    <div class="space-y-4">
      <CompaBand :compa="grade.compa" :grade-code="cur.code" />
      <ReviewHistory :reviews="reviewList" :code-of="codeOf" />
      <EvidenceTimeline :evidence="evidence" />
    </div>
    <ReviewModal
      v-if="reviewOpen && modalReview && member"
      :member-id="memberId"
      :member-name="member.name"
      :member-hue="member.hue"
      :review="modalReview"
      @close="reviewOpen = false"
    />
  </div>
</template>
