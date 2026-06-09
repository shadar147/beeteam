"use client";
import { useGradesFramework } from "@/lib/query/grades";
import { useMemberGrade } from "@/lib/query/member-grade";
import { GradeHero } from "@/components/grades/GradeHero";
import { BlockProfile } from "@/components/grades/BlockProfile";
import { GrowChecklist } from "@/components/grades/GrowChecklist";
import { CompaBand } from "@/components/grades/CompaBand";
import { EvidenceTimeline } from "@/components/grades/EvidenceTimeline";
import { GradeEmptyState } from "@/components/grades/GradeEmptyState";
import { useMemberEvidence } from "@/lib/query/evidence";

export function GradeTab({ memberId }: { memberId: string }) {
  const fw = useGradesFramework();
  const mg = useMemberGrade(memberId);
  const ev = useMemberEvidence(memberId);

  if (fw.isLoading || mg.isLoading || ev.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (fw.isError || mg.isError || ev.isError)
    return <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">Не удалось загрузить грейд.</div>;

  const grade = mg.data;
  if (!grade) return <GradeEmptyState />;

  const framework = fw.data!;
  const discipline = framework.disciplines.find((d) => d.key === grade.discipline_key);
  if (!discipline) return <GradeEmptyState />;

  const levels = [...framework.levels].sort((a, b) => a.ord - b.ord);
  const levelByOrd = (ord: number) => levels.find((l) => l.ord === ord);
  const cur = levelByOrd(grade.grade_ord)!;
  const target = grade.target_ord != null ? levelByOrd(grade.target_ord) ?? null : null;

  const blockLevelOf = (blockKey: string) =>
    grade.block_levels.find((bl) => bl.block_key === blockKey)?.level_ord ?? grade.grade_ord;

  const blocks = discipline.blocks.map((b) => ({ name: b.name, cur: blockLevelOf(b.key) }));

  const growItems =
    grade.target_ord != null
      ? discipline.blocks
          .filter((b) => blockLevelOf(b.key) < grade.target_ord!)
          .map((b) => {
            const cell = b.cells.find((c) => c.level === grade.target_ord);
            return { blockName: b.name, targetCode: target?.code ?? "", text: cell?.text ?? "" };
          })
          .filter((it) => it.text.length > 0)
      : [];

  const evidence = ev.data ?? [];
  const growBlocks =
    grade.target_ord != null
      ? discipline.blocks
          .filter((b) => blockLevelOf(b.key) < grade.target_ord!)
          .filter((b) => {
            const cell = b.cells.find((c) => c.level === grade.target_ord);
            return (cell?.text ?? "").length > 0;
          })
      : [];
  const growItemsWithCount = growItems.map((it, i) => {
    const b = growBlocks[i];
    const count = b ? evidence.filter((e) => e.block_key === b.key && grade.target_ord != null && e.level_ord >= grade.target_ord).length : 0;
    return { ...it, evidenceCount: count };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 lg:col-span-2">
        <GradeHero
          gradeOrd={grade.grade_ord}
          gradeCode={cur.code}
          gradeName={cur.name}
          disciplineLabel={discipline.label}
          targetOrd={grade.target_ord ?? null}
          targetCode={target?.code ?? null}
          targetName={target?.name ?? null}
          readyMonths={grade.ready_months}
          mgrTrack={grade.mgr_track}
          nextReview={grade.next_review ?? null}
          lastReview={grade.last_review ?? null}
        />
      </div>
      <div className="space-y-4">
        <BlockProfile blocks={blocks} gradeOrd={grade.grade_ord} targetOrd={grade.target_ord ?? null} levelCount={levels.length} />
        {target && <GrowChecklist items={growItemsWithCount} targetCode={target.code} />}
      </div>
      <div className="space-y-4">
        <CompaBand compa={grade.compa} gradeCode={cur.code} />
        <EvidenceTimeline evidence={evidence} />
      </div>
    </div>
  );
}
