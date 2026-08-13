"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * Base dialog -- backdrop + centered card, Escape and backdrop-click both
 * close it. Every confirm/success prompt in the portal is built on this so
 * they share one focus/keyboard/animation behavior instead of each action
 * handler rolling its own.
 */
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4 backdrop-blur-sm motion-safe:animate-[fadeIn_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-navy/20 motion-safe:animate-[scaleIn_0.15s_ease-out]"
      >
        {children}
      </div>
    </div>
  );
}
