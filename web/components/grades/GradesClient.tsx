"use client";
import { useState } from "react";
import { Layers, SlidersHorizontal, Sparkles, CircleCheck, Settings, Pencil, Check, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegControl } from "@/components/SegControl";
import {
  useGradesFramework, useUpdateLevels, usePutDiscipline, useCreateDiscipline,
  type Discipline, type PutDiscipline as PutDisciplineBody,
} from "@/lib/query/grades";
import { GradeLevels } from "./GradeLevels";
import { GradeMatrix } from "./GradeMatrix";
import { GradeBands } from "./GradeBands";
import { LevelsEditor } from "./LevelsEditor";
import { MatrixEditor } from "./MatrixEditor";
import { CellEditor } from "./CellEditor";
import { NewDisciplineModal } from "./NewDisciplineModal";
import { emptyCells, type Draft, type DraftBlock, type DraftLevel } from "./editorTypes";

type Tab = "levels" | "matrix" | "bands";

const DISC_ICONS: Record<string, LucideIcon> = {
  fields: SlidersHorizontal, layers: Layers, spark: Sparkles, check: CircleCheck, settings: Settings,
};
const ICON_KEYS = ["layers", "fields", "spark", "check", "settings"] as const;

function snapshot(disc: Discipline, levels: DraftLevel[]): Draft {
  const blocks: DraftBlock[] = [...disc.blocks]
    .sort((a, b) => a.ord - b.ord)
    .map((b) => ({
      id: b.id,
      key: b.key,
      name: b.name,
      cells: Array.from({ length: 7 }, (_, i) => {
        const c = b.cells.find((x) => x.level === i + 1);
        return { level: i + 1, text: c?.text ?? null, required: c?.required ?? true };
      }),
    }));
  return { discId: disc.id, label: disc.label, icon: disc.icon, description: disc.description, blocks, levels, levelsDirty: false };
}

export function GradesClient({ canEdit }: { canEdit: boolean }) {
  const fw = useGradesFramework();
  const updateLevels = useUpdateLevels();
  const putDiscipline = usePutDiscipline();
  const createDiscipline = useCreateDiscipline();

  const [disc, setDisc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matrix");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openCell, setOpenCell] = useState<{ blockIdx: number; levelOrd: number } | null>(null);
  const [newDisc, setNewDisc] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const editing = draft !== null;
  const activeKey = disc ?? disciplines[0].key;
  const active = disciplines.find((d) => d.key === activeKey) ?? disciplines[0];
  const sortedLevels = [...levels].sort((a, b) => a.ord - b.ord);

  const enterEdit = () => {
    const lv: DraftLevel[] = sortedLevels.map((l) => ({
      ord: l.ord, code: l.code, name: l.name, exp: l.exp, autonomy: l.autonomy, scope: l.scope,
    }));
    setDraft(snapshot(active, lv));
    setTab("matrix");
    setError(null);
  };
  const cancelEdit = () => { setDraft(null); setError(null); };

  const save = async () => {
    if (!draft) return;
    setError(null);
    try {
      if (draft.levelsDirty) {
        await updateLevels.mutateAsync({
          levels: draft.levels.map((l) => ({ ord: l.ord, name: l.name, exp: l.exp, autonomy: l.autonomy, scope: l.scope })),
        });
      }
      const body: PutDisciplineBody = {
        label: draft.label, icon: draft.icon, description: draft.description,
        blocks: draft.blocks.map((b) => ({
          id: b.id, name: b.name,
          cells: b.cells.map((c) => ({ level_ord: c.level, text: c.text, required: c.required })),
        })),
      };
      await putDiscipline.mutateAsync({ id: draft.discId, body });
      setDraft(null);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      setError(status === 409
        ? "Нельзя удалить блок, по которому уже есть данные сотрудников. Верните блок и сохраните снова."
        : "Не удалось сохранить изменения. Попробуйте ещё раз.");
    }
  };

  // draft mutators
  const setMeta = (patch: Partial<Pick<Draft, "label" | "icon" | "description">>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const setLevel = (ord: number, patch: Partial<DraftLevel>) =>
    setDraft((d) => (d ? { ...d, levelsDirty: true, levels: d.levels.map((l) => (l.ord === ord ? { ...l, ...patch } : l)) } : d));
  const renameBlock = (i: number, name: string) =>
    setDraft((d) => (d ? { ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, name } : b)) } : d));
  const moveBlock = (from: number, to: number) =>
    setDraft((d) => {
      if (!d || to < 0 || to >= d.blocks.length) return d;
      const blocks = d.blocks.slice();
      [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
      return { ...d, blocks };
    });
  const deleteBlock = (i: number) =>
    setDraft((d) => (d ? { ...d, blocks: d.blocks.filter((_, j) => j !== i) } : d));
  const addBlock = () =>
    setDraft((d) => (d ? { ...d, blocks: [...d.blocks, { id: null, key: "", name: "Новый блок", cells: emptyCells() }] } : d));
  const applyCell = (blockIdx: number, levelOrd: number, cell: { text: string | null; required: boolean }) =>
    setDraft((d) => (d ? {
      ...d,
      blocks: d.blocks.map((b, j) => j !== blockIdx ? b : {
        ...b, cells: b.cells.map((c) => (c.level === levelOrd ? { ...c, text: cell.text, required: cell.required } : c)),
      }),
    } : d));

  const busy = updateLevels.isPending || putDiscipline.isPending;

  return (
    <div className="p-6">
      <div className="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-ink">
            Грейды
            {editing && <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">режим редактирования</span>}
          </h1>
          <p className="text-[13px] text-ink-3 tabular">Карта компетенций по дисциплинам · 7 уровней (IC1–IC7) · ревью раз в 6 мес</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!editing && canEdit && (
            <button type="button" onClick={enterEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
              <Pencil size={14} /> Редактировать
            </button>
          )}
          {editing && (
            <>
              <button type="button" onClick={cancelEdit} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint disabled:opacity-60">
                <X size={14} /> Отмена
              </button>
              <button type="button" onClick={save} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60">
                <Check size={14} /> Сохранить
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-miss/30 bg-miss-soft p-3 text-[12.5px] text-miss">{error}</div>
      )}

      {/* discipline cards */}
      <div className="mb-[18px] grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {disciplines.map((d) => {
          const Icon = DISC_ICONS[d.icon] ?? Layers;
          const on = d.key === activeKey;
          const dimmed = editing && !on;
          return (
            <button key={d.key} type="button"
              onClick={() => !editing && setDisc(d.key)}
              disabled={dimmed}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors",
                on ? "border-brand bg-brand-soft ring-[3px] ring-brand/10" : "border-line bg-bg-elev hover:bg-bg-tint",
                dimmed && "opacity-40",
              )}>
              <span className={cn("grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]",
                on ? "bg-brand text-[#1A1100]" : "bg-bg-tint text-ink-3")}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold tracking-tight text-ink">{d.label}</span>
                {d.description && <span className="block text-[11px] leading-snug text-ink-3">{d.description}</span>}
              </span>
            </button>
          );
        })}
        {editing && (
          <button type="button" onClick={() => setNewDisc(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line p-3 text-[13px] text-ink-3 hover:bg-bg-tint">
            + Новая дисциплина
          </button>
        )}
      </div>

      {/* discipline meta editor */}
      {editing && draft && (
        <div className="mb-4 rounded-xl border border-line bg-bg-elev p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-3">Дисциплина</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {ICON_KEYS.map((k) => {
                const Icon = DISC_ICONS[k];
                return (
                  <button key={k} type="button" aria-label={`Иконка ${k}`} onClick={() => setMeta({ icon: k })}
                    className={cn("grid h-8 w-8 place-items-center rounded-lg border",
                      draft.icon === k ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-3 hover:bg-bg-tint")}>
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>
            <input aria-label="Название дисциплины" value={draft.label} onChange={(e) => setMeta({ label: e.target.value })}
              className="min-w-[160px] flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-brand" />
            <input aria-label="Описание дисциплины" value={draft.description} onChange={(e) => setMeta({ description: e.target.value })}
              placeholder="Описание" className="min-w-[200px] flex-[2] rounded-md border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink-2 outline-none focus:border-brand" />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <SegControl
          options={editing
            ? [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }]
            : [{ value: "levels", label: "Уровни" }, { value: "matrix", label: "Матрица" }, { value: "bands", label: "Вилки" }]}
          value={tab === "bands" && editing ? "matrix" : tab}
          onChange={(v) => setTab(v as Tab)} />
      </div>

      {editing && draft ? (
        tab === "levels" ? (
          <LevelsEditor levels={draft.levels} onChange={setLevel} />
        ) : (
          <MatrixEditor
            blocks={draft.blocks} levels={draft.levels}
            onRename={renameBlock} onMove={moveBlock} onDelete={deleteBlock} onAdd={addBlock}
            onOpenCell={(blockIdx, levelOrd) => setOpenCell({ blockIdx, levelOrd })} />
        )
      ) : tab === "levels" ? (
        <GradeLevels levels={levels} />
      ) : tab === "bands" ? (
        <GradeBands levels={levels} taxRate={fw.data!.tax_rate} />
      ) : (
        <GradeMatrix discipline={active} levels={levels} />
      )}

      {editing && draft && openCell && (() => {
        const block = draft.blocks[openCell.blockIdx];
        const lvl = draft.levels.find((l) => l.ord === openCell.levelOrd)!;
        const cell = block.cells.find((c) => c.level === openCell.levelOrd)!;
        return (
          <CellEditor
            blockName={block.name} levelCode={lvl.code} levelName={lvl.name} initial={cell.text}
            onApply={(c) => applyCell(openCell.blockIdx, openCell.levelOrd, c)}
            onClose={() => setOpenCell(null)} />
        );
      })()}

      {editing && newDisc && (
        <NewDisciplineModal
          bases={disciplines.map((d) => ({ id: d.id, label: d.label }))}
          creating={createDiscipline.isPending}
          onClose={() => setNewDisc(false)}
          onCreate={async (b) => {
            try {
              const created = await createDiscipline.mutateAsync(b);
              setNewDisc(false);
              setDraft(null);            // leave edit mode; the new discipline is now in the framework
              setDisc(created.key);      // switch to it
            } catch {
              setError("Не удалось создать дисциплину.");
            }
          }} />
      )}
    </div>
  );
}
