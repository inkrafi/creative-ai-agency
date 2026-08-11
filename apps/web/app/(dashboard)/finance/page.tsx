"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PAYMENT_TYPE_LABEL } from "@/lib/status";
import { Badge, Card, SectionTitle } from "@/components/ui";
import type { Payment, Project, ProjectSummary } from "@/lib/types";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </Card>
  );
}

export default function FinancePage() {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    void api<ProjectSummary>("/projects/summary").then(setSummary);
    void api<Project[]>("/projects").then(setProjects);
  }, []);

  const priced = projects.filter((p) => p.totalPriceIdr !== null);
  const paidCount = priced.filter((p) => p.paymentStatus === "PAID").length;
  const unpaidCount = priced.length - paidCount;

  const recentPayments = projects
    .flatMap((p) => p.payments.map((pay) => ({ ...pay, projectName: p.name })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12) as (Payment & { projectName: string })[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs font-medium text-ink-muted">Keuangan</div>
        <h1 className="text-2xl font-bold text-ink">Pembayaran</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pendapatan Tercatat" value={summary ? formatIdr(summary.totalRevenueIdr) : "—"} />
        <StatCard label="Belum Lunas" value={summary ? formatIdr(summary.outstandingIdr) : "—"} />
        <StatCard label="Proyek Lunas" value={String(paidCount)} />
        <StatCard label="Proyek Belum Lunas" value={String(unpaidCount)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <div className="p-5 pb-0">
            <SectionTitle>Status per proyek</SectionTitle>
          </div>
          {projects.length === 0 ? (
            <p className="p-5 pt-0 text-sm text-ink-muted">Belum ada proyek.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {projects
                .filter((p) => p.totalPriceIdr !== null)
                .map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                      <div className="text-xs text-ink-muted">
                        {formatIdr(p.totalPaidIdr)} / {formatIdr(p.totalPriceIdr ?? 0)}
                      </div>
                    </div>
                    <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>
                      {PAYMENT_STATUS_LABEL[p.paymentStatus]}
                    </Badge>
                  </Link>
                ))}
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="p-5 pb-0">
            <SectionTitle>Pembayaran terbaru</SectionTitle>
          </div>
          {recentPayments.length === 0 ? (
            <p className="p-5 pt-0 text-sm text-ink-muted">Belum ada pembayaran tercatat.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {recentPayments.map((pay) => (
                <div key={pay.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{pay.projectName}</div>
                    <div className="text-xs text-ink-muted">
                      {PAYMENT_TYPE_LABEL[pay.type]} · {pay.method} · {formatDate(pay.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-ink">{formatIdr(pay.amountIdr)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
