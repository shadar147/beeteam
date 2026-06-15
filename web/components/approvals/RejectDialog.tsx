"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";

export function RejectDialog({
  onSubmit, onClose, busy,
}: {
  onSubmit: (comment: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <Modal title="Вернуть лиду" onClose={onClose}>
      <label htmlFor="reject-comment" className="mb-2 block text-[12.5px] text-ink-2">
        Причина возврата
      </label>
      <textarea
        id="reject-comment"
        rows={4}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Что нужно доработать лиду перед повторной отправкой…"
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg-tint">
          Отмена
        </button>
        <button
          type="button"
          disabled={comment.trim().length === 0 || busy}
          onClick={() => onSubmit(comment.trim())}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-text disabled:opacity-60"
        >
          Вернуть лиду
        </button>
      </div>
    </Modal>
  );
}
