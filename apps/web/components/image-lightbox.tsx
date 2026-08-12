"use client";

import { useEffect, useState } from "react";

/**
 * A thumbnail that opens the full image on click -- payment proof images
 * were previously locked at a tiny fixed size with no way to actually
 * inspect them before deciding to approve/reject. `src` is a data: URI
 * (see Payment.proofImageUrl's schema comment), which renders inline in
 * both the thumbnail and the full view without any extra fetch.
 */
export function ImageLightbox({
  src,
  alt,
  thumbnailClassName = "h-16 w-16 rounded-lg border border-border object-cover",
}: {
  src: string;
  alt: string;
  thumbnailClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimizable remote asset */}
        <img src={src} alt={alt} className={thumbnailClassName} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimizable remote asset */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
