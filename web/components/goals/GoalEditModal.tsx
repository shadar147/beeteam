"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { OkrForm, type OkrValues } from "./OkrForm";
import { useCreateGoal, useUpdateGoal, useDeleteGoal } from "@/lib/query/goals";
import type { Goal } from "@/lib/query/profile";

export function GoalEditModal({ memberId, goal, onClose }: { memberId: string; goal?: Goal; onClose: () => void }) {
  const create = useCreateGoal(memberId);
  const update = useUpdateGoal(memberId);
  const del = useDeleteGoal(memberId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || del.isPending;

  function submit(v: OkrValues) {
    setError(null);
    const onError = () => setError("Не удалось сохранить");
    if (goal) update.mutate({ id: goal.id, body: v }, { onSuccess: onClose, onError });
    else create.mutate({ member_id: memberId, ...v }, { onSuccess: onClose, onError });
  }
  function remove() {
    if (goal && confirm("Удалить цель?"))
      del.mutate(goal.id, { onSuccess: onClose, onError: () => setError("Не удалось удалить") });
  }

  return (
    <Modal title={goal ? "Изменить цель" : "Новая цель"} onClose={onClose}>
      <OkrForm initial={goal} onSubmit={submit} onDelete={goal ? remove : undefined} pending={pending} error={error} />
    </Modal>
  );
}
