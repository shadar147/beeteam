"use client";
import { useState } from "react";
import { OkrCard } from "@/components/OkrCard";
import { DevItemRow } from "@/components/DevItemRow";
import { CompetencyBar } from "@/components/CompetencyBar";
import { GoalEditModal } from "@/components/goals/GoalEditModal";
import { DevItemEditModal } from "@/components/goals/DevItemEditModal";
import { CompetencyEditModal } from "@/components/goals/CompetencyEditModal";
import { useMemberGoals, type Goal, type DevItem, type Competency } from "@/lib/query/profile";

type ModalState =
  | { type: "okr"; entity?: Goal }
  | { type: "dev"; entity?: DevItem }
  | { type: "comp"; entity?: Competency }
  | null;

const addBtn = "rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-bg-tint";

export function GoalsTab({ memberId }: { memberId: string }) {
  const goals = useMemberGoals(memberId);
  const [modal, setModal] = useState<ModalState>(null);

  if (goals.isLoading) return <div className="text-[13px] text-ink-3">Загрузка…</div>;
  if (goals.isError)
    return (
      <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
        Не удалось загрузить цели.{" "}
        <button className="underline" onClick={() => goals.refetch()}>Повторить</button>
      </div>
    );

  const { okrs, development, competencies } = goals.data!;

  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-6">
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Цели на {okrs[0]?.quarter ?? "квартал"}</h2>
            <button className={addBtn} onClick={() => setModal({ type: "okr" })}>+ Добавить</button>
          </div>
          {okrs.length ? (
            <div className="space-y-3">
              {okrs.map((o) => <OkrCard key={o.id} okr={o} onEdit={() => setModal({ type: "okr", entity: o })} />)}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">Целей пока нет</p>
          )}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">План развития</h2>
            <button className={addBtn} onClick={() => setModal({ type: "dev" })}>+ Добавить</button>
          </div>
          {development.length ? (
            <div className="rounded-lg border border-line bg-bg-elev px-4">
              {development.map((d) => <DevItemRow key={d.id} item={d} onEdit={() => setModal({ type: "dev", entity: d })} />)}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">План развития пуст</p>
          )}
        </section>
      </div>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Компетенции</h2>
          <button className={addBtn} onClick={() => setModal({ type: "comp" })}>+ Добавить</button>
        </div>
        <div className="rounded-lg border border-line bg-bg-elev p-4">
          {competencies.length ? (
            competencies.map((c) => <CompetencyBar key={c.id} competency={c} onEdit={() => setModal({ type: "comp", entity: c })} />)
          ) : (
            <p className="text-[13px] text-ink-3">Нет данных</p>
          )}
        </div>
      </section>

      {modal?.type === "okr" && <GoalEditModal memberId={memberId} goal={modal.entity} onClose={() => setModal(null)} />}
      {modal?.type === "dev" && <DevItemEditModal memberId={memberId} item={modal.entity} onClose={() => setModal(null)} />}
      {modal?.type === "comp" && <CompetencyEditModal memberId={memberId} competency={modal.entity} onClose={() => setModal(null)} />}
    </div>
  );
}
