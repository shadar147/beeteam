"use client";
import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { Modal } from "@/components/Modal";
import { DECISION_LABEL } from "@/components/grades/ReviewHistory";
import { ScoresReadonly } from "./ScoresReadonly";
import { RejectDialog } from "./RejectDialog";
import type { PendingReview } from "@/lib/query/approvals";

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function ApprovalDetail({
  item, onApprove, onReject, busy,
}: {
  item: PendingReview;
  onApprove: (reviewId: string) => void;
  onReject: (reviewId: string, comment: string) => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const r = item.review;
  const promo = r.decision === "promote";
  const effects = promo
    ? `IC${r.from_grade_ord} → IC${r.to_grade_ord ?? r.from_grade_ord} · compa в низ новой полосы · следующее ревью через 6 мес`
    : "уровни по блокам обновятся по оценке лида · следующее ревью через 6 мес";

  return (
    <div className="rounded-xl border border-line bg-bg-elev p-5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={item.member_name} hue={item.member_hue} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold text-ink">{item.member_name}</div>
          <div className="text-[12px] text-ink-3">
            {item.team_name} · {item.discipline_label} · {r.period} · отправлено {fmt(r.finalized_at)}
          </div>
        </div>
        <Pill variant="accent">
          {r.decision ? DECISION_LABEL[r.decision] ?? r.decision : "—"}
        </Pill>
      </div>

      <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-4">
        Оценка по блокам · IC{r.from_grade_ord}{r.target_ord != null && <> → цель IC{r.target_ord}</>}
      </div>
      <ScoresReadonly scores={r.scores} />

      {r.summary && (
        <div className="mt-4">
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-4">Резюме лида</div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{r.summary}</p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-line-2 pt-4">
        <button type="button" onClick={() => setRejecting(true)} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">
          <Undo2 size={14} /> Вернуть лиду
        </button>
        <button type="button" onClick={() => setConfirming(true)} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
          <Check size={14} /> Согласовать
        </button>
      </div>

      {confirming && (
        <Modal title="Согласовать ревью" onClose={() => setConfirming(false)}>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {item.member_name} · {effects}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
              Отмена
            </button>
            <button type="button" disabled={busy}
              onClick={() => { setConfirming(false); onApprove(r.id); }}
              className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
              Подтвердить
            </button>
          </div>
        </Modal>
      )}
      {rejecting && (
        <RejectDialog
          busy={busy}
          onClose={() => setRejecting(false)}
          onSubmit={(comment) => { setRejecting(false); onReject(r.id, comment); }}
        />
      )}
    </div>
  );
}
