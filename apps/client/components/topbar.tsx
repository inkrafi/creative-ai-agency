"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GridIcon, LogOutIcon } from "./icons";

const NAV_ITEMS = [{ href: "/home", label: "Beranda", icon: GridIcon }];

/**
 * A real nav bar, not just a clickable logo -- a client who lands mid-flow
 * (e.g. from an email link, or a bookmark) needs an obvious, always-visible
 * way back to their project list, not just an implicit "click the logo"
 * convention. Still deliberately shallow: this portal has one top-level
 * destination (Beranda); everything else is scoped inside a project and
 * reachable from there.
 */
export function Topbar() {
  const { user, organization, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/home" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            K
          </div>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold text-ink">Kravio Studio</div>
            <div className="truncate text-xs text-ink-muted">{organization?.name ?? "Portal klien"}</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-brand-light text-brand-dark" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon width={16} height={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden truncate text-sm text-ink-muted md:inline">{user?.email}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOutIcon width={16} height={16} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
}
