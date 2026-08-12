import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared left-hand brand panel for /login and /daftar -- same dark
 * blue-ink gradient as the landing page hero so arriving here from "/"
 * doesn't feel like a jump to a different product. The form itself
 * (right side) is passed in as children.
 */
export function AuthPanel({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-page sm:flex-row">
      <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#123a63] via-[#0d2547] to-[#0a1526] px-6 py-8 sm:w-[42%] sm:px-10 sm:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-brand/25 blur-3xl"
        />

        <Link href="/" className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            K
          </div>
          <div className="text-sm font-semibold text-white">Kravio Studio</div>
        </Link>

        <div className="relative mt-10 sm:mt-0">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
            {eyebrow}
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-balance text-white sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-xs text-sm text-white/70">{blurb}</p>
        </div>

        <p className="relative hidden text-xs text-white/40 sm:block">Kravio Studio &middot; Portal klien</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
