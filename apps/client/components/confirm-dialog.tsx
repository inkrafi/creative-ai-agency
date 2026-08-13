"use client";

import { Modal } from "./modal";
import { Button } from "./ui";
import { AlertCircleIcon } from "./icons";

/** Asks before a consequential, hard-to-undo action (e.g. approving a task closes it out for good). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  submitting = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel}>
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning">
          <AlertCircleIcon width={22} height={22} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1.5 text-sm text-ink-muted">{message}</p>
      </div>
      <div className="mt-6 flex gap-2">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 justify-center"
          onClick={onCancel}
          disabled={submitting}
        >
          {cancelLabel}
        </Button>
        <Button type="button" className="flex-1 justify-center" onClick={onConfirm} disabled={submitting}>
          {submitting ? "Memproses…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
