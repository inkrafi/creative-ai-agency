"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatIdr } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import type { Invoice, Project } from "@/lib/types";

export default function InvoiceDetailPage({ params }: PageProps<"/riwayat/invoice/[projectId]/[invoiceId]">) {
  const { projectId, invoiceId } = use(params);
  const { user, organization } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api<Project>(`/projects/${projectId}`)
      .then(setProject)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [projectId]);

  if (notFound) return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  if (!project) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const invoice: Invoice | undefined = project.invoices.find((inv) => inv.id === invoiceId);
  if (!invoice) return <p className="text-sm text-ink-muted">Invoice tidak ditemukan.</p>;

  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/riwayat" className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Riwayat
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
            <div className="text-xs text-ink-muted">{formatDate(invoice.createdAt)}</div>
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
          <div className="text-3xl font-semibold tabular-nums text-ink">{formatIdr(invoice.amountIdr)}</div>
          {invoice.minDpPercent !== null && (
            <div className="mt-1 text-xs text-ink-muted">DP minimal yang disarankan: {invoice.minDpPercent}%</div>
          )}
          {invoice.note && <div className="mt-2 text-sm text-ink-muted">{invoice.note}</div>}
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
    </div>
  );
}
