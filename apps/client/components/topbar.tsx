"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { LogOutIcon } from "./icons";

/**
 * A top bar, not the staff dashboard's sidebar -- this portal has a handful
 * of screens for a non-technical audience, not a dense multi-section
 * dashboard. Deliberately no nav links beyond the logo (home); each page
 * links onward to where it makes sense (project -> brief, project ->
 * payment) rather than a persistent menu.
 */
export function Topbar() {
  const { user, organization, logout } = useAuth();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            K
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">Kravio Studio</div>
            <div className="truncate text-xs text-ink-muted">{organization?.name ?? "Portal klien"}</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden truncate text-sm text-ink-muted sm:inline">{user?.email}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOutIcon width={16} height={16} />
            Keluar
          </button>
        </div>
      </div>
    </header>
  );
}
