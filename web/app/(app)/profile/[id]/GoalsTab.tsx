"use client";
import { OkrCard } from "@/components/OkrCard";
import { DevItemRow } from "@/components/DevItemRow";
import { CompetencyBar } from "@/components/CompetencyBar";
import { useMemberGoals } from "@/lib/query/profile";

export function GoalsTab({ memberId }: { memberId: string }) {
  const goals = useMemberGoals(memberId);

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
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Цели на {okrs[0]?.quarter ?? "квартал"}</h2>
          {okrs.length ? (
            <div className="space-y-3">{okrs.map((o) => <OkrCard key={o.id} okr={o} />)}</div>
          ) : (
            <p className="text-[13px] text-ink-3">Целей пока нет</p>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-ink">План развития</h2>
          {development.length ? (
            <div className="rounded-lg border border-line bg-bg-elev px-4">
              {development.map((d) => <DevItemRow key={d.id} item={d} />)}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">План развития пуст</p>
          )}
        </section>
      </div>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Компетенции</h2>
        <div className="rounded-lg border border-line bg-bg-elev p-4">
          {competencies.length ? (
            competencies.map((c) => <CompetencyBar key={c.id} competency={c} />)
          ) : (
            <p className="text-[13px] text-ink-3">Нет данных</p>
          )}
        </div>
      </section>
    </div>
  );
}
