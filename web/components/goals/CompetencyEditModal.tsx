"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { CompetencyForm, type CompetencyValues } from "./CompetencyForm";
import { useCreateCompetency, useUpdateCompetency, useDeleteCompetency } from "@/lib/query/goals";
import type { Competency } from "@/lib/query/profile";

export function CompetencyEditModal({ memberId, competency, onClose }: { memberId: string; competency?: Competency; onClose: () => void }) {
  const create = useCreateCompetency(memberId);
  const update = useUpdateCompetency(memberId);
  const del = useDeleteCompetency(memberId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || del.isPending;

  function submit(v: CompetencyValues) {
    setError(null);
    const onError = () => setError("Не удалось сохранить");
    if (competency) update.mutate({ id: competency.id, body: v }, { onSuccess: onClose, onError });
    else create.mutate({ member_id: memberId, ...v }, { onSuccess: onClose, onError });
  }
  function remove() {
    if (competency && confirm("Удалить компетенцию?"))
      del.mutate(competency.id, { onSuccess: onClose, onError: () => setError("Не удалось удалить") });
  }

  return (
    <Modal title={competency ? "Изменить компетенцию" : "Новая компетенция"} onClose={onClose}>
      <CompetencyForm initial={competency} onSubmit={submit} onDelete={competency ? remove : undefined} pending={pending} error={error} />
    </Modal>
  );
}
