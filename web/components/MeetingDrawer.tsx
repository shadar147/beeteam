"use client";
import { useEffect, useReducer, useState } from "react";
import { useMeeting, useMemberFiles } from "@/lib/query/profile";
import {
  useTemplate, useMeetingAutosave, useCompleteMeeting, useDeleteMeeting,
} from "@/lib/query/meetings";
import {
  formFromMeeting, formToPatch, meetingFormReducer, toLocalInput, fromLocalInput, type MeetingForm,
} from "@/lib/meeting-form";
import { downloadFile, useDeleteFile } from "@/lib/query/files";
import { FileDropzone } from "@/components/FileDropzone";
import { CompetencyCapture } from "@/components/meeting/CompetencyCapture";
import { FieldControl } from "./FieldControl";
import { Pill } from "./Pill";

// template field title → MeetingForm key
const TITLE_TO_FIELD: Record<string, keyof MeetingForm> = {
  "Настроение": "mood",
  "Блокеры": "blockers",
  "Цели": "goals",
  "Фидбек сотруднику": "feedback_to",
  "Фидбек от сотрудника": "feedback_from",
  "Развитие": "development",
  "Отношения": "relationships",
};

const EMPTY: MeetingForm = {
  date: "", duration_min: 45, mood: "", mood_score: null, blockers: "", goals: "",
  feedback_to: "", feedback_from: "", development: "", relationships: "",
};

export function MeetingDrawer({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const meeting = useMeeting(meetingId);
  const template = useTemplate(meeting.data?.template_id ?? null);
  const memberId = meeting.data?.member_id ?? "";
  const autosave = useMeetingAutosave(meetingId, memberId);
  const complete = useCompleteMeeting();
  const del = useDeleteMeeting();
  const memberFiles = useMemberFiles(meeting.data?.member_id ?? "");
  const delFile = useDeleteFile(meeting.data?.member_id ?? "");
  const attachments = (memberFiles.data ?? []).filter((f) => f.meeting_id === meetingId);

  const [form, dispatch] = useReducer(meetingFormReducer, EMPTY);
  const [actionError, setActionError] = useState<string | null>(null);

  // Seed the form once the meeting loads.
  useEffect(() => {
    if (meeting.data) dispatch({ type: "reset", form: formFromMeeting(meeting.data) });
  }, [meeting.data]);

  function edit(field: keyof MeetingForm, value: string | number | null) {
    const next = meetingFormReducer(form, { type: "set", field, value });
    dispatch({ type: "set", field, value });
    autosave.schedule(formToPatch(next));
  }

  function editMany(updates: Partial<MeetingForm>) {
    const next = { ...form, ...updates };
    dispatch({ type: "reset", form: next });
    autosave.schedule(formToPatch(next));
  }

  const done = meeting.data?.state === "done";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Закрыть" className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => { autosave.flush(); onClose(); }} />
      <aside className="flex h-full w-[92vw] max-w-[720px] flex-col bg-bg-elev shadow-pop">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <Pill variant={done ? "ok" : "info"} dot>{done ? "Завершена" : "Запланирована"}</Pill>
            <span className="text-[12px] text-ink-3" data-save-status={autosave.status}>
              {autosave.status === "saving" ? "● Сохранение…" : autosave.status === "error" ? "● Не сохранено" : autosave.status === "saved" ? "● Сохранено" : ""}
            </span>
          </div>
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => { autosave.flush(); onClose(); }}>✕</button>
        </header>

        {!done && form.date && (
          <div className="flex items-center gap-2 border-b border-line px-5 py-2 text-[12px] text-ink-3">
            <span>Перенести:</span>
            <input
              type="datetime-local"
              aria-label="Дата встречи"
              value={toLocalInput(form.date)}
              onChange={(e) => edit("date", fromLocalInput(e.target.value))}
              className="rounded-md border border-line bg-bg-elev px-2 py-1 text-[12px] text-ink tabular"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {meeting.isLoading || template.isLoading ? (
            <div className="text-[13px] text-ink-3">Загрузка…</div>
          ) : meeting.isError ? (
            <div className="rounded-lg border border-miss/30 bg-miss-soft p-4 text-[13px] text-miss">
              Не удалось загрузить встречу.{" "}
              <button className="underline" onClick={() => meeting.refetch()}>Повторить</button>
            </div>
          ) : (
            <>
              {(template.data?.fields ?? []).map((f) => {
                const key = TITLE_TO_FIELD[f.title];
                const value = key ? String(form[key] ?? "") : "";
                return (
                  <FieldControl
                    key={f.id}
                    field={f}
                    value={f.kind === "mood" ? form.mood : value}
                    moodScore={form.mood_score}
                    onChange={(v) => key && edit(key, v)}
                    onMood={(emoji, score) => editMany({ mood: emoji, mood_score: score })}
                  />
                );
              })}
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Вложения</div>
                {attachments.length === 0 ? (
                  <p className="text-[12px] text-ink-3">Вложений нет</p>
                ) : (
                  <ul className="mb-2 space-y-1">
                    {attachments.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                        <button type="button" className="truncate text-left hover:underline" onClick={() => downloadFile(f.id).catch(() => {})}>{f.name}</button>
                        <button type="button" aria-label="Удалить" className="ml-auto text-ink-3 hover:text-ink"
                          onClick={() => { if (confirm("Удалить файл?")) delFile.mutate(f.id); }}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
                {meeting.data && (
                  <FileDropzone
                    memberId={meeting.data.member_id}
                    meetingId={meetingId}
                    onUploaded={() => memberFiles.refetch()}
                  />
                )}
              </div>
              {meeting.data && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Проявленные компетенции</div>
                  <CompetencyCapture memberId={meeting.data.member_id} meetingId={meetingId} />
                </div>
              )}
            </>
          )}
        </div>

        {actionError && (
          <div className="border-t border-miss/30 bg-miss-soft px-5 py-2 text-[12px] text-miss">{actionError}</div>
        )}
        <footer className="flex gap-2 border-t border-line px-5 py-3">
          {!done && (
            <button
              type="button"
              className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text"
              onClick={() => {
                setActionError(null);
                autosave.flush();
                complete.mutate(meetingId, {
                  onSuccess: onClose,
                  onError: () => setActionError("Не удалось завершить встречу"),
                });
              }}
            >
              Завершить
            </button>
          )}
          {!done && (
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2"
              onClick={() => {
                if (confirm("Удалить встречу?")) {
                  setActionError(null);
                  del.mutate({ id: meetingId, memberId }, {
                    onSuccess: onClose,
                    onError: () => setActionError("Не удалось удалить встречу"),
                  });
                }
              }}
            >
              Отменить
            </button>
          )}
          <button type="button" className="ml-auto rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2" onClick={() => { autosave.flush(); onClose(); }}>
            Закрыть
          </button>
        </footer>
      </aside>
    </div>
  );
}
