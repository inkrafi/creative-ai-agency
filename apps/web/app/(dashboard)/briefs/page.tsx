"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import { Badge } from "@/components/ui";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/data-table";
import type { Brief, Invoice, Project } from "@/lib/types";

const TYPE_LABEL: Record<Brief["type"], string> = { LANDING_PAGE: "Landing Page", DESIGN: "Desain", VIDEO: "Video" };

export default function BriefsPage() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoicedBriefIds, setInvoicedBriefIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void api<Brief[]>("/briefs").then(setBriefs);
    void api<Project[]>("/projects").then(setProjects);
  }, []);

  useEffect(() => {
    if (!briefs || briefs.length === 0) return;
    const projectIds = [...new Set(briefs.map((b) => b.projectId))];
    void Promise.all(projectIds.map((id) => api<Invoice[]>(`/projects/${id}/invoices`))).then((lists) => {
      const ids = new Set<string>();
      for (const list of lists) for (const inv of list) if (inv.briefId) ids.add(inv.briefId);
      setInvoicedBriefIds(ids);
    });
  }, [briefs]);

  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const sorted = useMemo(
    () =>
      briefs
        ? [...briefs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : null,
    [briefs],
  );

  const columns: DataTableColumn<Brief>[] = [
    {
      key: "title",
      header: "Brief",
      render: (b) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{b.title}</span>
            {b.needsClarification && <Badge tone="warning">Menunggu klien</Badge>}
          </div>
          <div className="truncate text-xs text-ink-muted">
            {projectNameById.get(b.projectId) ?? "Proyek tidak diketahui"} · {formatDate(b.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tipe",
      render: (b) => <Badge>{TYPE_LABEL[b.type]}</Badge>,
    },
    {
      key: "price",
      header: "Estimasi AI",
      render: (b) => (
        <Badge tone={b.aiSuggestedPriceIdr !== null ? "success" : "warning"}>
          {b.aiSuggestedPriceIdr !== null ? formatIdr(b.aiSuggestedPriceIdr) : "Belum diestimasi"}
        </Badge>
      ),
    },
    {
      key: "invoice",
      header: "Invoice",
      render: (b) => (
        <Badge tone={invoicedBriefIds.has(b.id) ? "success" : "neutral"}>
          {invoicedBriefIds.has(b.id) ? "Terkirim" : "Belum ada"}
        </Badge>
      ),
    },
  ];

  const filters: DataTableFilter<Brief>[] = [
    {
      key: "type",
      label: "Tipe",
      options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
      getValue: (b) => b.type,
    },
    {
      key: "price",
      label: "Estimasi AI",
      options: [
        { value: "YES", label: "Sudah diestimasi" },
        { value: "NO", label: "Belum diestimasi" },
      ],
      getValue: (b) => (b.aiSuggestedPriceIdr !== null ? "YES" : "NO"),
    },
    {
      key: "invoice",
      label: "Invoice",
      options: [
        { value: "YES", label: "Terkirim" },
        { value: "NO", label: "Belum ada" },
      ],
      getValue: (b) => (invoicedBriefIds.has(b.id) ? "YES" : "NO"),
    },
    {
      key: "clarification",
      label: "Klarifikasi",
      options: [
        { value: "YES", label: "Menunggu klien" },
        { value: "NO", label: "Tidak menunggu" },
      ],
      getValue: (b) => (b.needsClarification ? "YES" : "NO"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs font-medium text-ink-muted">Pekerjaan</div>
        <h1 className="text-2xl font-bold text-ink">Brief</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Semua brief yang diajukan klien atau dibuat staff, di seluruh proyek.
        </p>
      </div>

      {sorted === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : (
        <DataTable
          data={sorted}
          columns={columns}
          rowKey={(b) => b.id}
          getRowHref={(b) => `/briefs/${b.id}`}
          searchPlaceholder="Cari judul brief atau proyek…"
          searchValue={(b) => `${b.title} ${projectNameById.get(b.projectId) ?? ""}`}
          filters={filters}
          emptyMessage="Belum ada brief."
        />
      )}
    </div>
  );
}
