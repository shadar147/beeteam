<script setup lang="ts">
import { computed } from "vue";
import { useGradesFramework } from "~/lib/query/grades";
import { useMemberGrade } from "~/lib/query/member-grade";
import { useMemberEvidence, useCreateEvidence, useDeleteEvidence } from "~/lib/query/evidence";
import CompetencyCaptureView from "~/components/meeting/CompetencyCaptureView.vue";

const props = defineProps<{ memberId: string; meetingId: string }>();

const fw = useGradesFramework();
const mg = useMemberGrade(() => props.memberId);
const ev = useMemberEvidence(() => props.memberId);
const create = useCreateEvidence(() => props.memberId);
const del = useDeleteEvidence(() => props.memberId);

const loading = computed(() => fw.isLoading.value || mg.isLoading.value);

const grade = computed(() => mg.data.value ?? null);
const discipline = computed(() =>
  grade.value && fw.data.value
    ? fw.data.value.disciplines.find((d) => d.key === grade.value!.discipline_key)
    : undefined,
);

// Everything the view needs; null when the member has no grade on a known ladder.
const view = computed(() => {
  const g = grade.value;
  const disc = discipline.value;
  if (!g || !disc) return null;

  const levels = [...fw.data.value!.levels].sort((a, b) => a.ord - b.ord);
  const levelByOrd = (ord: number) => levels.find((l) => l.ord === ord);
  const blockLevelOf = (key: string) => g.block_levels.find((bl) => bl.block_key === key)?.level_ord ?? g.grade_ord;

  const growthHints =
    g.target_ord != null
      ? disc.blocks
          .filter((b) => blockLevelOf(b.key) < g.target_ord!)
          .map((b) => ({ key: b.key, name: b.name, text: b.cells.find((c) => c.level === g.target_ord)?.text ?? "" }))
          .filter((h) => h.text.length > 0)
      : [];

  const logged = (ev.data.value ?? [])
    .filter((e) => e.meeting_id === props.meetingId)
    .map((e) => ({ id: e.id, blockName: e.block_name, level: e.level_ord, status: e.status, note: e.note }));

  const target = g.target_ord != null ? levelByOrd(g.target_ord) ?? null : null;

  return {
    grade: {
      gradeOrd: g.grade_ord,
      gradeCode: levelByOrd(g.grade_ord)?.code ?? "",
      gradeName: levelByOrd(g.grade_ord)?.name ?? "",
      disciplineLabel: disc.label,
      targetOrd: g.target_ord ?? null,
      targetCode: target?.code ?? null,
      readyMonths: g.ready_months,
    },
    blocks: disc.blocks.map((b) => ({ key: b.key, name: b.name })),
    growthHints,
    levels: levels.map((l) => ({ ord: l.ord, code: l.code })),
    logged,
  };
});

function onAdd(blockKey: string, level: number, status: string, note: string) {
  const block_id = discipline.value?.blocks.find((b) => b.key === blockKey)?.id;
  if (!block_id) return;
  create.mutate({ member_id: props.memberId, meeting_id: props.meetingId, block_id, level_ord: level, status, note });
}
</script>

<template>
  <p v-if="loading" class="text-[12.5px] text-ink-3">Загрузка…</p>
  <CompetencyCaptureView
    v-else-if="!view"
    :grade="null"
    :blocks="[]"
    :growth-hints="[]"
    :levels="[]"
    :logged="[]"
  />
  <CompetencyCaptureView
    v-else
    :grade="view.grade"
    :blocks="view.blocks"
    :growth-hints="view.growthHints"
    :levels="view.levels"
    :logged="view.logged"
    @add="onAdd"
    @remove="(id) => del.mutate(id)"
  />
</template>
