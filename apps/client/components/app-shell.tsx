"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Sidebar } from "./sidebar";
import { MenuIcon, XIcon } from "./icons";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-page">
      {/* Desktop: fixed left rail */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64 lg:border-r lg:border-border">
        <Sidebar />
      </aside>

      {/* Mobile: slim top bar with hamburger */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 print:hidden lg:hidden">
        <Link href="/home" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-ink">
            K
          </div>
          <span className="text-sm font-semibold text-ink">Kravio Studio</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Buka menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <MenuIcon width={20} height={20} />
        </button>
      </div>

      {/* Mobile: drawer overlay */}
      {mobileOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-40 flex bg-navy/50 backdrop-blur-sm motion-safe:animate-[fadeIn_0.15s_ease-out] lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full w-72 max-w-[80vw] bg-surface shadow-2xl motion-safe:animate-[scaleIn_0.15s_ease-out]"
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Tutup menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <XIcon width={18} height={18} />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
