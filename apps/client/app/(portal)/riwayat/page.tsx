"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import { PAYMENT_TYPE_LABEL, PAYMENT_VERIFICATION_LABEL, PAYMENT_VERIFICATION_TONE } from "@/lib/status";
import { Badge, Card } from "@/components/ui";
import { DocumentIcon, WalletIcon } from "@/components/icons";
import type { Project } from "@/lib/types";

interface HistoryItem {
  id: string;
  timestamp: string;
  kind: "payment" | "invoice";
  projectId: string;
  projectName: string;
  amountIdr: number;
  label: string;
  statusLabel: string;
  statusTone: "neutral" | "warning" | "success" | "danger";
  href: string;
}

function buildHistory(projects: Project[]): HistoryItem[] {
  const items: HistoryItem[] = [];

  for (const p of projects) {
    for (const pay of p.payments) {
      items.push({
        id: `payment-${pay.id}`,
        timestamp: pay.createdAt,
        kind: "payment",
        projectId: p.id,
        projectName: p.name,
        amountIdr: pay.amountIdr,
        label: `${PAYMENT_TYPE_LABEL[pay.type]} · ${pay.method}`,
        statusLabel: PAYMENT_VERIFICATION_LABEL[pay.verificationStatus],
        statusTone: PAYMENT_VERIFICATION_TONE[pay.verificationStatus],
        href: `/projects/${p.id}#riwayat-pembayaran`,
      });
    }
    for (const inv of p.invoices) {
      items.push({
        id: `invoice-${inv.id}`,
        timestamp: inv.createdAt,
        kind: "invoice",
        projectId: p.id,
        projectName: p.name,
        amountIdr: inv.amountIdr,
        label: inv.minDpPercent !== null ? `Invoice · DP minimal ${inv.minDpPercent}%` : "Invoice",
        statusLabel: inv.emailSentAt ? "Email terkirim" : "Email belum terkirim",
        statusTone: inv.emailSentAt ? "success" : "neutral",
        href: `/projects/${p.id}#riwayat-invoice`,
      });
    }
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items;
}

export default function RiwayatPage() {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    void api<Project[]>("/projects").then((projects) => setHistory(buildHistory(projects)));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Riwayat</h1>
        <p className="mt-1 text-sm text-ink-muted">Riwayat pembayaran dan invoice dari seluruh proyek Anda.</p>
      </div>

      {history === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : history.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">Belum ada riwayat pembayaran atau invoice.</p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {history.map((item) => {
              const Icon = item.kind === "payment" ? WalletIcon : DocumentIcon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-2"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
                    <Icon width={16} height={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{item.label}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-muted">
                      {item.projectName} · {formatDate(item.timestamp)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-sm font-semibold tabular-nums text-ink">{formatIdr(item.amountIdr)}</div>
                    <Badge tone={item.statusTone}>{item.statusLabel}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
