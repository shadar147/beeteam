"use client";
import { useState } from "react";
import { SegControl } from "@/components/SegControl";
import { useGradesFramework } from "@/lib/query/grades";
import { GradeLevels } from "./GradeLevels";
import { GradeMatrix } from "./GradeMatrix";
import { GradeBands } from "./GradeBands";

type Tab = "levels" | "matrix" | "bands";

export function GradesClient() {
  const fw = useGradesFramework();
  const [disc, setDisc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matrix");

  if (fw.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (fw.isError)
    return (
      <div className="p-6">
        <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
          Не удалось загрузить грейды.{" "}
          <button className="underline" onClick={() => fw.refetch()}>Повторить</button>
        </div>
      </div>
    );

  const { levels, disciplines } = fw.data!;
  if (disciplines.length === 0) {
    return <div className="p-6 text-center text-[14px] text-ink-3">Карта грейдов пока не настроена</div>;
  }
  const activeKey = disc ?? disciplines[0].key;
  const active = disciplines.find((d) => d.key === activeKey) ?? disciplines[0];

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-ink">Грейды</h1>
        <p className="text-[13px] text-ink-3 tabular">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegControl
          options={disciplines.map((d) => ({ value: d.key, label: d.label }))}
          value={activeKey} onChange={setDisc} />
        <SegControl
          options={[{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]}
          value={tab} onChange={(v) => setTab(v as Tab)} />
      </div>

      {tab === "levels" ? (
        <GradeLevels levels={levels} />
      ) : tab === "bands" ? (
        <GradeBands levels={levels} />
      ) : (
        <GradeMatrix discipline={active} levels={levels} />
      )}
    </div>
  );
}
