"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import {
  PAYMENT_TYPE_LABEL,
  PAYMENT_VERIFICATION_LABEL,
  PAYMENT_VERIFICATION_TONE,
} from "@/lib/status";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/data-table";
import type { Project } from "@/lib/types";

interface Transaction {
  id: string;
  timestamp: string;
  kind: "payment" | "invoice";
  projectId: string;
  briefName: string;
  amountIdr: number;
  itemLabel: string;
  statusLabel: string;
  statusTone: "neutral" | "warning" | "success" | "danger";
  href: string;
}

const KIND_LABEL: Record<Transaction["kind"], string> = { payment: "Pembayaran", invoice: "Invoice" };
const KIND_TONE: Record<Transaction["kind"], "brand" | "navy"> = { payment: "brand", invoice: "navy" };

const STATUS_FILTER_OPTIONS = [
  "Menunggu verifikasi",
  "Terverifikasi",
  "Ditolak",
  "Email terkirim",
  "Email belum terkirim",
];

function buildTransactions(projects: Project[]): Transaction[] {
  const items: Transaction[] = [];

  for (const p of projects) {
    for (const pay of p.payments) {
      items.push({
        id: `payment-${pay.id}`,
        timestamp: pay.createdAt,
        kind: "payment",
        projectId: p.id,
        briefName: p.name,
        amountIdr: pay.amountIdr,
        itemLabel: `${PAYMENT_TYPE_LABEL[pay.type]} · ${pay.method}`,
        statusLabel: PAYMENT_VERIFICATION_LABEL[pay.verificationStatus],
        statusTone: PAYMENT_VERIFICATION_TONE[pay.verificationStatus],
        href: `/keuangan/pembayaran/${p.id}/${pay.id}`,
      });
    }
    for (const inv of p.invoices) {
      items.push({
        id: `invoice-${inv.id}`,
        timestamp: inv.createdAt,
        kind: "invoice",
        projectId: p.id,
        briefName: p.name,
        amountIdr: inv.amountIdr,
        itemLabel: inv.minDpPercent !== null ? `Invoice · DP minimal ${inv.minDpPercent}%` : "Invoice",
        statusLabel: inv.emailSentAt ? "Email terkirim" : "Email belum terkirim",
        statusTone: inv.emailSentAt ? "success" : "neutral",
        href: `/keuangan/invoice/${p.id}/${inv.id}`,
      });
    }
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items;
}

export default function KeuanganPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    void api<Project[]>("/projects").then(setProjects);
  }, []);

  const transactions = projects ? buildTransactions(projects) : [];
  const needsPayment = (projects ?? []).filter(
    (p) => p.totalPriceIdr !== null && p.totalPriceIdr - p.totalPaidIdr > 0,
  );

  const columns: DataTableColumn<Transaction>[] = [
    { key: "brief", header: "Brief", render: (t) => <span className="font-medium text-ink">{t.briefName}</span> },
    { key: "date", header: "Tanggal", render: (t) => <span className="text-ink-muted">{formatDate(t.timestamp)}</span> },
    { key: "kind", header: "Jenis", render: (t) => <Badge tone={KIND_TONE[t.kind]}>{KIND_LABEL[t.kind]}</Badge> },
    {
      key: "amount",
      header: "Jumlah",
      align: "right",
      render: (t) => <span className="font-semibold tabular-nums text-ink">{formatIdr(t.amountIdr)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <div className="flex flex-col gap-0.5">
          <Badge tone={t.statusTone}>{t.statusLabel}</Badge>
          <span className="text-xs text-ink-muted">{t.itemLabel}</span>
        </div>
      ),
    },
  ];

  const filters: DataTableFilter<Transaction>[] = [
    {
      key: "kind",
      label: "Jenis",
      options: (Object.keys(KIND_LABEL) as Transaction["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
      getValue: (t) => t.kind,
    },
    {
      key: "status",
      label: "Status",
      options: STATUS_FILTER_OPTIONS.map((label) => ({ value: label, label })),
      getValue: (t) => t.statusLabel,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Keuangan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Status tagihan, riwayat pembayaran, dan invoice untuk semua brief Anda.
        </p>
      </div>

      {needsPayment.length > 0 && (
        <Card className="border-warning/40 bg-warning-bg/40">
          <SectionTitle>Perlu Dibayar</SectionTitle>
          <div className="flex flex-col divide-y divide-border">
            {needsPayment.map((p) => {
              const remaining = p.totalPriceIdr! - p.totalPaidIdr;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs text-ink-muted">Sisa {formatIdr(remaining)}</div>
                  </div>
                  <Link href={`/projects/${p.id}/payment`}>
                    <Button type="button">{p.totalPaidIdr > 0 ? "Lunasi Sekarang" : "Bayar Sekarang"}</Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {projects === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : transactions.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">Belum ada riwayat pembayaran atau invoice.</p>
        </Card>
      ) : (
        <DataTable
          data={transactions}
          columns={columns}
          rowKey={(t) => t.id}
          searchPlaceholder="Cari nama brief…"
          searchValue={(t) => t.briefName}
          filters={filters}
          getRowHref={(t) => t.href}
          emptyMessage="Tidak ada transaksi yang cocok."
        />
      )}
    </div>
  );
}
