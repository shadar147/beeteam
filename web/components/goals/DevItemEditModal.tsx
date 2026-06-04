"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { DevItemForm, type DevItemValues } from "./DevItemForm";
import { useCreateDevItem, useUpdateDevItem, useDeleteDevItem } from "@/lib/query/goals";
import type { DevItem } from "@/lib/query/profile";

export function DevItemEditModal({ memberId, item, onClose }: { memberId: string; item?: DevItem; onClose: () => void }) {
  const create = useCreateDevItem(memberId);
  const update = useUpdateDevItem(memberId);
  const del = useDeleteDevItem(memberId);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || del.isPending;

  function submit(v: DevItemValues) {
    setError(null);
    const onError = () => setError("Не удалось сохранить");
    if (item) update.mutate({ id: item.id, body: v }, { onSuccess: onClose, onError });
    else create.mutate({ member_id: memberId, ...v }, { onSuccess: onClose, onError });
  }
  function remove() {
    if (item && confirm("Удалить пункт?"))
      del.mutate(item.id, { onSuccess: onClose, onError: () => setError("Не удалось удалить") });
  }

  return (
    <Modal title={item ? "Изменить пункт" : "Новый пункт развития"} onClose={onClose}>
      <DevItemForm initial={item} onSubmit={submit} onDelete={item ? remove : undefined} pending={pending} error={error} />
    </Modal>
  );
}
