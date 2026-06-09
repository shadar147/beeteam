"use client";
import { useGradesFramework } from "@/lib/query/grades";
import { useMemberGrade } from "@/lib/query/member-grade";
import { useMemberEvidence, useCreateEvidence, useDeleteEvidence } from "@/lib/query/evidence";
import { CompetencyCaptureView } from "./CompetencyCaptureView";

export function CompetencyCapture({ memberId, meetingId }: { memberId: string; meetingId: string }) {
  const fw = useGradesFramework();
  const mg = useMemberGrade(memberId);
  const ev = useMemberEvidence(memberId);
  const create = useCreateEvidence(memberId);
  const del = useDeleteEvidence(memberId);

  if (fw.isLoading || mg.isLoading) return <p className="text-[12.5px] text-ink-3">Загрузка…</p>;

  const grade = mg.data ?? null;
  const framework = fw.data;
  const discipline = grade && framework ? framework.disciplines.find((d) => d.key === grade.discipline_key) : undefined;

  if (!grade || !discipline) {
    return <CompetencyCaptureView grade={null} blocks={[]} growthHints={[]} levels={[]} logged={[]} onAdd={() => {}} onRemove={() => {}} />;
  }

  const levels = [...framework!.levels].sort((a, b) => a.ord - b.ord);
  const levelByOrd = (ord: number) => levels.find((l) => l.ord === ord);
  const blockIdByKey = (key: string) => discipline.blocks.find((b) => b.key === key)?.id;
  const blockLevelOf = (key: string) => grade.block_levels.find((bl) => bl.block_key === key)?.level_ord ?? grade.grade_ord;

  const growthHints =
    grade.target_ord != null
      ? discipline.blocks
          .filter((b) => blockLevelOf(b.key) < grade.target_ord!)
          .map((b) => ({ key: b.key, name: b.name, text: b.cells.find((c) => c.level === grade.target_ord)?.text ?? "" }))
          .filter((h) => h.text.length > 0)
      : [];

  const logged = (ev.data ?? [])
    .filter((e) => e.meeting_id === meetingId)
    .map((e) => ({ id: e.id, blockName: e.block_name, level: e.level_ord, status: e.status, note: e.note }));

  const target = grade.target_ord != null ? levelByOrd(grade.target_ord) ?? null : null;

  return (
    <CompetencyCaptureView
      grade={{
        gradeOrd: grade.grade_ord,
        gradeCode: levelByOrd(grade.grade_ord)?.code ?? "",
        gradeName: levelByOrd(grade.grade_ord)?.name ?? "",
        disciplineLabel: discipline.label,
        targetOrd: grade.target_ord ?? null,
        targetCode: target?.code ?? null,
        readyMonths: grade.ready_months,
      }}
      blocks={discipline.blocks.map((b) => ({ key: b.key, name: b.name }))}
      growthHints={growthHints}
      levels={levels.map((l) => ({ ord: l.ord, code: l.code }))}
      logged={logged}
      onAdd={(blockKey, level, status, note) => {
        const block_id = blockIdByKey(blockKey);
        if (!block_id) return;
        create.mutate({ member_id: memberId, meeting_id: meetingId, block_id, level_ord: level, status, note });
      }}
      onRemove={(id) => del.mutate(id)}
    />
  );
}
