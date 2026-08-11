"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/status";
import { Card, Badge } from "@/components/ui";
import { ChevronRightIcon } from "@/components/icons";
import type { Project, ProjectSummary } from "@/lib/types";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </Card>
  );
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    void api<ProjectSummary>("/projects/summary").then(setSummary);
    void api<Project[]>("/projects").then(setProjects);
  }, []);

  const needsAttention = projects.filter(
    (p) => p.paymentStatus === "UNPAID" || p.paymentStatus === "PARTIAL",
  );

  return (
    <div className="flex flex-col gap-7">
      <div>
        <div className="text-xs font-medium text-ink-muted">Ringkasan</div>
        <h1 className="text-2xl font-bold text-ink">Halo, selamat bekerja</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Proyek Aktif" value={summary ? String(summary.activeProjects) : "—"} />
        <StatCard label="Menunggu Review Klien" value={summary ? String(summary.tasksInReview) : "—"} />
        <StatCard
          label="Pendapatan Tercatat"
          value={summary ? formatIdr(summary.totalRevenueIdr) : "—"}
        />
        <StatCard label="Belum Lunas" value={summary ? formatIdr(summary.outstandingIdr) : "—"} />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Proyek belum lunas</h2>
          <Link href="/finance" className="flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            Lihat semua <ChevronRightIcon width={16} height={16} />
          </Link>
        </div>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-ink-muted">Semua proyek yang punya harga sudah lunas.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {needsAttention.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                  <div className="text-xs text-ink-muted">
                    {formatIdr(p.totalPaidIdr)} / {formatIdr(p.totalPriceIdr ?? 0)}
                  </div>
                </div>
                <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
