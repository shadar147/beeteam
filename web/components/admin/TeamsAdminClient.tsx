"use client";
import { useState } from "react";

/** Dark ink on light colors, white on dark — keeps the initials readable on any team color. */
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#1A1812";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1A1812" : "#FFFFFF";
}
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  useTeams, useAssignableLeads, useCreateTeam, useUpdateTeam, useDeleteTeam,
  type TeamRow, type TeamInput,
} from "@/lib/query/teams";
import { TeamEditModal } from "./TeamEditModal";

export function TeamsAdminClient() {
  const teams = useTeams();
  const leads = useAssignableLeads();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [modal, setModal] = useState<{ open: boolean; team: TeamRow | null }>({ open: false, team: null });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (teams.isLoading) return <div className="p-6 text-[13px] text-ink-3">Загрузка…</div>;
  if (teams.isError) return <div className="p-6 text-[13px] text-miss">Не удалось загрузить команды.</div>;

  const rows = teams.data!;
  const totalMembers = rows.reduce((s, t) => s + t.member_count, 0);
  const noLead = rows.filter((t) => t.lead_id == null).length;
  const saving = createTeam.isPending || updateTeam.isPending;

  const save = async (body: TeamInput) => {
    setError(null);
    try {
      if (modal.team) await updateTeam.mutateAsync({ id: modal.team.id, body });
      else await createTeam.mutateAsync(body);
      setModal({ open: false, team: null });
    } catch {
      setError("Не удалось сохранить команду. Попробуйте ещё раз.");
    }
  };

  const remove = async (t: TeamRow) => {
    setMenuFor(null);
    if (!confirm(`Удалить команду «${t.name}»?`)) return;
    setError(null);
    try {
      await deleteTeam.mutateAsync(t.id);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      setError(status === 409
        ? "Нельзя удалить команду с сотрудниками — сначала переместите или удалите их."
        : "Не удалось удалить команду.");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Команды</h1>
          <p className="text-[13px] text-ink-3 tabular">{rows.length} команд · {totalMembers} сотрудников · {noLead} без лида</p>
        </div>
        <button type="button" onClick={() => { setError(null); setModal({ open: true, team: null }); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text">
          <Plus size={14} /> Новая команда
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-miss/30 bg-miss-soft p-3 text-[12.5px] text-miss">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
        <div className="grid items-center gap-4 bg-bg-tint px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3"
          style={{ gridTemplateColumns: "minmax(180px,1.4fr) 1.2fr 110px 130px 44px" }}>
          <div>Команда</div><div>Лид</div><div>Сотрудников</div><div>Статус</div><div></div>
        </div>
        {rows.map((t) => (
          <div key={t.id} className="grid items-center gap-4 border-t border-line-2 px-[18px] py-3"
            style={{ gridTemplateColumns: "minmax(180px,1.4fr) 1.2fr 110px 130px 44px" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold tabular"
                style={{ background: t.color, color: readableOn(t.color) }}>{t.name.slice(0, 2).toUpperCase()}</span>
              <span className="text-[13.5px] font-semibold text-ink">{t.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {t.lead_id != null
                ? <><Avatar name={t.lead_name ?? ""} hue={t.lead_hue ?? 40} size="sm" /><span className="text-[13px]">{t.lead_name}</span></>
                : <span className="text-[13px] italic text-miss">— не назначен —</span>}
            </div>
            <div className="tabular text-[14px] font-semibold text-ink">{t.member_count}</div>
            <div>
              {t.lead_id == null
                ? <span className="rounded-full bg-miss-soft px-2 py-0.5 text-[11px] font-medium text-miss">Без лида</span>
                : <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">Активна</span>}
            </div>
            <div className="relative">
              <button type="button" aria-label={`Меню ${t.name}`} onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
                className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-bg-tint"><MoreHorizontal size={14} /></button>
              {menuFor === t.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                  <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-bg-elev shadow-pop">
                    <button type="button" onClick={() => { setMenuFor(null); setError(null); setModal({ open: true, team: t }); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-bg-tint"><Pencil size={13} /> Редактировать</button>
                    <button type="button" onClick={() => remove(t)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-miss hover:bg-bg-tint"><Trash2 size={13} /> Удалить</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal.open && (
        <TeamEditModal
          initial={modal.team}
          leads={leads.data ?? []}
          saving={saving}
          error={error}
          onClose={() => setModal({ open: false, team: null })}
          onSave={save}
        />
      )}
    </div>
  );
}
