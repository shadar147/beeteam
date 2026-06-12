"use client";
import { useEffect, useMemo, useState } from "react";
import { Flag, Layers, Scale, Award, Check, ArrowRight, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { useGradesFramework } from "@/lib/query/grades";
import { useMemberGrade } from "@/lib/query/member-grade";
import { useMemberEvidence } from "@/lib/query/evidence";
import {
  type Review, useReviewAutosave, useUpdateReview, useFinalizeReview, useDeleteReview, useReviewCalibration,
} from "@/lib/query/reviews";
import { ReviewPrep } from "./ReviewPrep";
import { ReviewAssess, type AssessBlock } from "./ReviewAssess";
import { ReviewCalibrate, type CalibRow } from "./ReviewCalibrate";
import { ReviewDecision, type Decision } from "./ReviewDecision";

const STEPS = [
  { id: "prep", label: "Подготовка", icon: Flag },
  { id: "assess", label: "Оценка по блокам", icon: Layers },
  { id: "calibrate", label: "Калибровка", icon: Scale },
  { id: "decision", label: "Решение", icon: Award },
] as const;

export function ReviewModal({
  memberId, memberName, memberHue, review, onClose,
}: {
  memberId: string;
  memberName: string;
  memberHue: number;
  review: Review;
  onClose: () => void;
}) {
  const fw = useGradesFramework();
  const mg = useMemberGrade(memberId);
  const ev = useMemberEvidence(memberId);
  const calib = useReviewCalibration(review.id);
  const autosave = useReviewAutosave(review.id, memberId);
  const update = useUpdateReview(review.id, memberId);
  const finalize = useFinalizeReview(memberId);
  const del = useDeleteReview(memberId);

  const [step, setStep] = useState(0);
  const [finishError, setFinishError] = useState(false);
  const [leads, setLeads] = useState<Record<string, number>>(
    () => Object.fromEntries(review.scores.map((s) => [s.block_id, s.lead_ord])),
  );
  const [decision, setDecision] = useState<Decision | null>((review.decision as Decision) ?? null);
  const [summary, setSummary] = useState(review.summary);

  const { flush } = autosave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { flush(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flush, onClose]);

  const grade = mg.data;
  const framework = fw.data;
  const discipline = framework?.disciplines.find((d) => d.key === grade?.discipline_key);
  const levels = useMemo(
    () => (framework ? [...framework.levels].sort((a, b) => a.ord - b.ord) : []),
    [framework],
  );
  const codeOf = (ord: number | null | undefined) =>
    ord != null ? levels.find((l) => l.ord === ord)?.code ?? `IC${ord}` : "";

  if (fw.isLoading || mg.isLoading || ev.isLoading) {
    return <Scrim onClose={onClose}><div className="p-10 text-[13px] text-ink-3">Загрузка…</div></Scrim>;
  }
  if (!grade || !discipline || !framework) {
    return <Scrim onClose={onClose}><div className="p-10 text-[13px] text-miss">Не удалось загрузить данные грейда.</div></Scrim>;
  }

  const evidence = ev.data ?? [];
  const targetOrd = review.target_ord ?? null;
  const fromCode = codeOf(review.from_grade_ord);
  const targetCode = targetOrd != null ? codeOf(targetOrd) : null;
  const promo = targetOrd != null && targetOrd > review.from_grade_ord;

  const blocks: AssessBlock[] = discipline.blocks.map((b) => {
    const score = review.scores.find((s) => s.block_key === b.key)!;
    return {
      blockId: score.block_id,
      name: b.name,
      selfOrd: score.self_ord ?? null,
      leadOrd: leads[score.block_id] ?? score.lead_ord,
      evidenceCount: evidence.filter((e) => e.block_key === b.key).length,
      descByLevel: levels.map((l) => b.cells.find((c) => c.level === l.ord)?.text ?? null),
    };
  });
  const leadVals = blocks.map((b) => b.leadOrd);
  const avgLead = leadVals.reduce((a, v) => a + v, 0) / Math.max(leadVals.length, 1);
  const meetsNext = targetOrd != null ? blocks.filter((b) => b.leadOrd >= targetOrd).length : 0;

  const calibRows: CalibRow[] = [
    { id: memberId, name: memberName, hue: memberHue, avg: avgLead, me: true, promo },
    ...(calib.data ?? []).map((p) => ({
      id: p.member_id, name: p.name, hue: p.hue, avg: p.avg_level, me: false,
      promo: p.target_ord != null && p.target_ord > review.from_grade_ord,
    })),
  ];

  const scoresPatch = () =>
    Object.entries(leads).map(([block_id, lead_ord]) => ({ block_id, lead_ord }));

  const setLead = (blockId: string, ord: number) => {
    const next = { ...leads, [blockId]: ord };
    setLeads(next);
    autosave.schedule({ scores: Object.entries(next).map(([block_id, lead_ord]) => ({ block_id, lead_ord })) });
  };
  const onDecision = (d: Decision) => { setDecision(d); autosave.schedule({ decision: d }); };
  const onSummary = (s: string) => { setSummary(s); autosave.schedule({ summary: s }); };

  const finish = async () => {
    // The direct save below carries the full state, so the queued debounce patch
    // is redundant — cancel it to avoid a stray PATCH landing after finalize.
    autosave.cancel();
    setFinishError(false);
    try {
      await update.mutateAsync({ scores: scoresPatch(), decision: decision ?? undefined, summary });
      await finalize.mutateAsync(review.id);
      onClose();
    } catch {
      setFinishError(true);
    }
  };
  const cancelDraft = () => {
    if (window.confirm("Удалить черновик ревью? Оценки и резюме будут потеряны.")) {
      del.mutate(review.id, { onSuccess: onClose });
    }
  };

  const hints = [
    `Самооценка ${review.scores.some((s) => s.self_ord != null) ? "получена" : "не получена"} · ${evidence.length} свидетельств в истории`,
    targetCode ? `${meetsNext}/${blocks.length} блоков на уровне ${targetCode}` : "Подтверждение текущего уровня",
    "Сравнение с сотрудниками того же грейда",
    "После сохранения решение уйдёт на согласование HR",
  ];

  return (
    <Scrim onClose={() => { autosave.flush(); onClose(); }}>
      {/* header */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={memberName} hue={memberHue} size="md" />
          <div>
            <div className="text-[15px] font-semibold text-ink">Performance Review · {memberName}</div>
            <div className="text-[12px] text-ink-3">
              {review.period} · {discipline.label} · {fromCode}
              {promo && targetCode && <> · цель {targetCode}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-3" data-save-status={autosave.status}>
            {autosave.status === "saving" ? "● Сохранение…" : autosave.status === "error" ? "● Не сохранено" : autosave.status === "saved" ? "● Сохранено" : ""}
          </span>
          <button type="button" aria-label="Закрыть" className="text-ink-3 hover:text-ink"
            onClick={() => { autosave.flush(); onClose(); }}>✕</button>
        </div>
      </div>

      {/* step rail */}
      <div className="flex gap-1 border-b border-line px-6 py-2.5">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              data-active={step === i}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px]",
                step === i ? "bg-brand-soft font-semibold text-ink" : "text-ink-3 hover:bg-bg-tint",
              )}
            >
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border",
                step > i ? "border-ok bg-ok-soft text-ok" : "border-line text-ink-3")}>
                {step > i ? <Check size={12} /> : <Icon size={12} />}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* body */}
      <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
        {review.status === "draft" && review.hr_comment && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-brand/40 bg-brand-soft p-3 text-[12.5px] text-ink-2">
            <Undo2 size={15} className="mt-0.5 shrink-0 text-brand-strong" />
            <div>
              <b>Возвращено HR:</b> {review.hr_comment}
            </div>
          </div>
        )}
        {step === 0 && (
          <ReviewPrep
            gradeCode={fromCode} targetCode={targetCode} promo={promo}
            readyMonths={grade.ready_months}
            selfRows={review.scores.map((s) => ({ name: s.block_name, ord: s.self_ord ?? null, code: codeOf(s.self_ord) }))}
            evidence={evidence}
          />
        )}
        {step === 1 && (
          <ReviewAssess blocks={blocks} levels={levels} targetOrd={targetOrd} onSetLead={setLead} />
        )}
        {step === 2 && (
          <ReviewCalibrate
            rows={calibRows} gradeCode={fromCode} targetCode={targetCode} targetOrd={targetOrd}
            disciplineLabel={discipline.label} levels={levels} avgLead={avgLead}
          />
        )}
        {step === 3 && (
          <ReviewDecision
            gradeOrd={review.from_grade_ord} gradeCode={fromCode}
            nextCode={codeOf(Math.min(review.from_grade_ord + 1, 7))}
            decision={decision} onDecision={onDecision}
            summary={summary} onSummary={onSummary}
            compa={grade.compa}
            lowBlocks={blocks.filter((b) => b.leadOrd < review.from_grade_ord).map((b) => b.name)}
          />
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-line px-6 py-3.5">
        <div className="flex items-center gap-4 text-[12px] text-ink-3">
          <span>{hints[step]}</span>
          {finishError && <span className="text-miss">Не удалось завершить ревью — попробуйте ещё раз.</span>}
          {step === 0 && (
            <button type="button" onClick={cancelDraft}
              className="inline-flex items-center gap-1 text-ink-4 hover:text-miss">
              <Trash2 size={12} /> Удалить черновик
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
              Назад
            </button>
          )}
          {step < 3 ? (
            <button type="button" onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
              Далее <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={finish}
              disabled={decision == null || update.isPending || finalize.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
              <Check size={14} /> Завершить ревью
            </button>
          )}
        </div>
      </div>
    </Scrim>
  );
}

function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Performance Review"
        className="relative z-10 w-full max-w-[1040px] rounded-xl border border-line bg-bg-elev shadow-pop">
        {children}
      </div>
    </div>
  );
}
