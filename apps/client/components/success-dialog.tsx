"use client";

import Link from "next/link";
import { Modal } from "./modal";
import { Button } from "./ui";
import { CheckCircleIcon } from "./icons";

/** Confirms an action actually went through -- shown instead of a small inline line of text, since a client checking on their own project deserves an unambiguous "yes, that worked." */
export function SuccessDialog({
  open,
  title,
  message,
  actionLabel = "OK",
  onClose,
  secondaryAction,
}: {
  open: boolean;
  title: string;
  message?: string;
  actionLabel?: string;
  onClose: () => void;
  secondaryAction?: { label: string; href: string };
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success">
          <CheckCircleIcon width={24} height={24} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
        {message && <p className="mt-1.5 text-sm text-ink-muted">{message}</p>}
      </div>
      <div className="mt-6 flex gap-2">
        {secondaryAction && (
          <Link href={secondaryAction.href} className="flex-1">
            <Button type="button" variant="ghost" className="w-full justify-center">
              {secondaryAction.label}
            </Button>
          </Link>
        )}
        <Button type="button" className="flex-1 justify-center" onClick={onClose}>
          {actionLabel}
        </Button>
      </div>
    </Modal>
  );
}
