"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { briefListStatus, derivePaymentStatus, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/status";
import { Badge, Button, Card } from "@/components/ui";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/data-table";
import { ClockIcon, PlusIcon, WalletIcon } from "@/components/icons";
import type { Brief, BriefType } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { LANDING_PAGE: "Landing Page", DESIGN: "Desain", VIDEO: "Video" };

// Categorical hues (see components/ui.tsx's badgeTones comment) so Jenis
// never gets confused for a status pill even when scanning quickly.
const TYPE_TONE: Record<BriefType, "brand" | "accent" | "navy"> = {
  LANDING_PAGE: "brand",
  DESIGN: "accent",
  VIDEO: "navy",
};

const PROGRESS_FILTER_OPTIONS = [
  "Menunggu harga dari tim Kravio",
  "Menunggu pembayaran",
  "Sedang dikerjakan",
  "Selesai",
];

export default function BriefsListPage() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);

  useEffect(() => {
    void api<Brief[]>("/briefs").then(setBriefs);
  }, []);

  const columns: DataTableColumn<Brief>[] = [
    {
      key: "title",
      header: "Brief",
      render: (b) => <span className="font-medium text-ink">{b.title}</span>,
    },
    {
      key: "date",
      header: "Tanggal",
      render: (b) => <span className="text-ink-muted">{formatDate(b.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (b) => {
        const progress = briefListStatus(b);
        const paymentStatus = derivePaymentStatus(b.project);
        return (
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1">
              <ClockIcon width={12} height={12} className="text-ink-muted" />
              <Badge tone={progress.tone}>{progress.label}</Badge>
            </span>
            <span className="inline-flex items-center gap-1">
              <WalletIcon width={12} height={12} className="text-ink-muted" />
              <Badge tone={PAYMENT_STATUS_TONE[paymentStatus]}>{PAYMENT_STATUS_LABEL[paymentStatus]}</Badge>
            </span>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Jenis",
      render: (b) => <Badge tone={TYPE_TONE[b.type]}>{TYPE_LABEL[b.type]}</Badge>,
    },
  ];

  const filters: DataTableFilter<Brief>[] = [
    {
      key: "type",
      label: "Jenis",
      options: (Object.keys(TYPE_LABEL) as BriefType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] })),
      getValue: (b) => b.type,
    },
    {
      key: "progress",
      label: "Status",
      options: PROGRESS_FILTER_OPTIONS.map((label) => ({ value: label, label })),
      getValue: (b) => briefListStatus(b).label,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Brief</h1>
          <p className="mt-1 text-sm text-ink-muted">Semua brief yang pernah Anda ajukan.</p>
        </div>
        <Link href="/briefs/new">
          <Button type="button">
            <PlusIcon width={16} height={16} />
            Brief Baru
          </Button>
        </Link>
      </div>

      {briefs === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : briefs.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Belum ada brief yang diajukan.{" "}
            <Link href="/briefs/new" className="font-medium text-brand hover:underline">
              Ajukan brief pertama Anda
            </Link>{" "}
            untuk mulai.
          </p>
        </Card>
      ) : (
        <DataTable
          data={briefs}
          columns={columns}
          rowKey={(b) => b.id}
          searchPlaceholder="Cari judul brief…"
          searchValue={(b) => b.title}
          filters={filters}
          getRowHref={(b) => `/briefs/${b.id}`}
          emptyMessage="Tidak ada brief yang cocok."
        />
      )}
    </div>
  );
}
