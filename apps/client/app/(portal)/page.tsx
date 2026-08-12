"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PROJECT_STATUS_LABEL } from "@/lib/status";
import { useAuth } from "@/lib/auth";
import { Badge, Card } from "@/components/ui";
import { ChevronRightIcon } from "@/components/icons";
import type { Project } from "@/lib/types";

export default function HomePage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    void api<Project[]>("/projects").then(setProjects);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs font-medium text-ink-muted">Halo, {user?.email}</div>
        <h1 className="text-2xl font-bold text-ink">Proyek Anda</h1>
      </div>

      {projects === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : projects.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Belum ada proyek yang terhubung dengan akun Anda. Hubungi tim Kravio jika ini tidak sesuai.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                {p.description && <div className="truncate text-xs text-ink-muted">{p.description}</div>}
                {p.totalPriceIdr !== null && (
                  <div className="mt-0.5 text-xs tabular-nums text-ink-muted">
                    {formatIdr(p.totalPaidIdr)} / {formatIdr(p.totalPriceIdr)}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
                <Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                <ChevronRightIcon width={16} height={16} className="text-ink-muted" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
