"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatIdr } from "@/lib/format";
import { Badge, Button, Card } from "@/components/ui";
import type { Invoice, Project } from "@/lib/types";

export default function InvoicePage({ params }: PageProps<"/projects/[id]/invoice">) {
  const { id } = use(params);
  const { user, organization } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api<Project>(`/projects/${id}`)
      .then(setProject)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
    void api<Invoice[]>(`/projects/${id}/invoices`).then(setInvoices);
  }, [id]);

  if (notFound) return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  if (!project || invoices === null) return <p className="text-sm text-ink-muted">Memuat…</p>;

  if (invoices.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Link href={`/projects/${id}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <Card>
          <p className="text-sm text-ink-muted">Belum ada invoice untuk proyek ini.</p>
        </Card>
      </div>
    );
  }

  const [latest, ...older] = invoices;
  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/projects/${id}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <Button type="button" onClick={() => window.print()}>
          Cetak / Simpan PDF
        </Button>
      </div>

      <Card className="relative overflow-hidden print:border-none print:shadow-none">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand via-brand-dark to-accent" />

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 pt-2">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
                K
              </div>
              <div className="text-sm font-semibold text-ink">Kravio Studio</div>
            </div>
            <div className="mt-1 text-xs text-ink-muted">{organization?.name ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-semibold text-ink">Invoice</div>
            <div className="text-xs text-ink-muted">{formatDate(latest.createdAt)}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-ink-muted">Ditagihkan kepada</div>
            <div className="text-sm font-medium text-ink">{user?.email}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-ink-muted">Proyek</div>
            <div className="text-sm font-medium text-ink">{project.name}</div>
          </div>
        </div>

        <div className="relative mt-6 rounded-xl border border-border bg-surface-2 p-5">
          {project.paymentStatus === "PAID" && (
            <div
              aria-hidden
              className="absolute top-3 right-4 rotate-12 rounded-lg border-2 border-success px-3 py-1 text-sm font-bold tracking-wide text-success/80 print:opacity-70"
            >
              LUNAS
            </div>
          )}
          <div className="text-xs text-ink-muted">Jumlah tagihan</div>
          <div className="text-3xl font-semibold tabular-nums text-ink">{formatIdr(latest.amountIdr)}</div>
          {latest.minDpPercent !== null && (
            <div className="mt-1 text-xs text-ink-muted">DP minimal yang disarankan: {latest.minDpPercent}%</div>
          )}
          {latest.note && <div className="mt-2 text-sm text-ink-muted">{latest.note}</div>}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-ink-muted">Total harga proyek</div>
            <div className="font-semibold tabular-nums text-ink">
              {project.totalPriceIdr !== null ? formatIdr(project.totalPriceIdr) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Sudah dibayar</div>
            <div className="font-semibold tabular-nums text-ink">{formatIdr(project.totalPaidIdr)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Sisa</div>
            <div className="font-semibold tabular-nums text-ink">{remaining !== null ? formatIdr(remaining) : "—"}</div>
          </div>
        </div>
      </Card>

      {older.length > 0 && (
        <Card className="print:hidden">
          <div className="mb-3 text-sm font-semibold text-ink">Riwayat invoice sebelumnya</div>
          <div className="flex flex-col divide-y divide-border">
            {older.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{formatIdr(inv.amountIdr)}</div>
                  <div className="text-xs text-ink-muted">
                    {formatDate(inv.createdAt)}
                    {inv.minDpPercent !== null ? ` — DP minimal ${inv.minDpPercent}%` : ""}
                  </div>
                  {inv.note && <div className="mt-0.5 text-xs text-ink-muted">{inv.note}</div>}
                </div>
                <Badge tone={inv.emailSentAt ? "success" : "neutral"}>
                  {inv.emailSentAt ? "Email terkirim" : "Email belum terkirim"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
