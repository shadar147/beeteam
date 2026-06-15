"use client";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { cn } from "@/lib/utils";
import { DECISION_LABEL } from "@/components/grades/ReviewHistory";
import { usePendingReviews, useApproveReview, useRejectReview } from "@/lib/query/approvals";
import { ApprovalDetail } from "./ApprovalDetail";

function fmt(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ApprovalsClient() {
  const pending = usePendingReviews();
  const approve = useApproveReview();
  const reject = useRejectReview();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (pending.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (pending.isError)
    return <div className="m-6 rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">Не удалось загрузить очередь.</div>;

  const items = pending.data ?? [];
  const selected = items.find((p) => p.review.id === selectedId) ?? items[0] ?? null;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-[20px] font-bold tracking-tight text-ink">Согласование</h1>
      <p className="mb-5 text-[12.5px] text-ink-3">
        Performance Review, ожидающие решения HR · {items.length}
      </p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-bg-elev p-8 text-center text-[13px] text-ink-3">
          Нет ревью на согласовании.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="space-y-2">
            {items.map((p) => (
              <button
                key={p.review.id}
                type="button"
                onClick={() => setSelectedId(p.review.id)}
                data-active={selected?.review.id === p.review.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left",
                  selected?.review.id === p.review.id
                    ? "border-brand bg-brand-soft/40"
                    : "border-line bg-bg-elev hover:bg-bg-tint",
                )}
              >
                <Avatar name={p.member_name} hue={p.member_hue} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{p.member_name}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {p.team_name} · {p.discipline_label} ·{" "}
                    <span className="tabular">IC{p.review.from_grade_ord} → IC{p.review.to_grade_ord ?? p.review.from_grade_ord}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill variant="accent">
                    {p.review.decision ? DECISION_LABEL[p.review.decision] ?? p.review.decision : "—"}
                  </Pill>
                  <span className="text-[11px] text-ink-4">{fmt(p.review.finalized_at)}</span>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <ApprovalDetail
              item={selected}
              busy={busy}
              onApprove={(reviewId) => approve.mutate({ reviewId }, { onSuccess: () => setSelectedId(null) })}
              onReject={(reviewId, comment) =>
                reject.mutate({ reviewId, comment }, { onSuccess: () => setSelectedId(null) })}
            />
          )}
        </div>
      )}
    </div>
  );
}
