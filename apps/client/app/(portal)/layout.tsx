"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default function PortalLayout({ children }: LayoutProps<"/">) {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        {status === "loading" ? "Memuat…" : "Mengalihkan ke login…"}
      </div>
    );
  }

  // This portal is for clients, not agency staff -- catches a staff member
  // accidentally logging into the wrong app rather than confusing them
  // with a client-shaped view of their own tenant.
  if (user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-ink">Ini portal klien. Staff Kravio menggunakan dashboard internal.</p>
        <button onClick={logout} className="text-sm font-medium text-brand hover:underline">
          Keluar
        </button>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
