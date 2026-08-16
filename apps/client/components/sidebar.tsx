"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { DocumentIcon, GridIcon, LogOutIcon, WalletIcon } from "./icons";

const NAV_ITEMS = [
  { href: "/home", label: "Beranda", icon: GridIcon },
  { href: "/briefs", label: "Brief", icon: DocumentIcon },
  { href: "/keuangan", label: "Keuangan", icon: WalletIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pure nav content -- rendered identically inside the desktop-fixed rail and the mobile drawer (see app-shell.tsx). */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, organization, user, logout } = useAuth();
  const pathname = usePathname();
  const displayName = profile?.name ?? user?.email ?? "";

  return (
    <div className="flex h-full flex-col bg-surface">
      <Link href="/home" onClick={onNavigate} className="flex shrink-0 items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
          K
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">Kravio Studio</div>
          <div className="truncate text-xs text-ink-muted">{organization?.name ?? "Portal klien"}</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-brand-light text-brand-dark" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon width={18} height={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <Link
          href="/profile"
          onClick={onNavigate}
          className={`flex items-center gap-2.5 rounded-xl p-2.5 transition ${
            isActive(pathname, "/profile") ? "bg-cream" : "bg-cream/60 hover:bg-cream"
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-cream-ink">{displayName}</div>
            <div className="truncate text-xs text-cream-ink/70">Lihat profil</div>
          </div>
        </Link>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <LogOutIcon width={18} height={18} />
          Keluar
        </button>
      </div>
    </div>
  );
}
