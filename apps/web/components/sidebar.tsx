"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GridIcon, FolderIcon, WalletIcon, UsersIcon, LogOutIcon } from "./icons";

const NAV_GROUPS = [
  {
    label: "Utama",
    items: [{ href: "/", label: "Ringkasan", icon: GridIcon }],
  },
  {
    label: "Pekerjaan",
    items: [{ href: "/projects", label: "Proyek", icon: FolderIcon }],
  },
  {
    label: "Keuangan",
    items: [{ href: "/finance", label: "Pembayaran", icon: WalletIcon }],
  },
  {
    label: "Tim",
    items: [{ href: "/clients", label: "Akun Klien", icon: UsersIcon }],
  },
];

const ROLE_LABEL: Record<string, string> = {
  AGENCY_ADMIN: "Admin",
  AGENCY_EDITOR: "Editor",
  CLIENT_APPROVER: "Klien (Approver)",
  CLIENT_VIEWER: "Klien (Viewer)",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, organization, logout } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
          K
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">Kravio Studio</div>
          <div className="truncate text-xs text-ink-muted">{organization?.name ?? "—"}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-brand-light text-brand-dark"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <Icon className="shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-3 min-w-0">
          <div className="truncate text-sm font-medium text-ink">{user?.email ?? "—"}</div>
          <div className="text-xs text-ink-muted">{user ? (ROLE_LABEL[user.role] ?? user.role) : "—"}</div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <LogOutIcon />
          Keluar
        </button>
      </div>
    </aside>
  );
}
