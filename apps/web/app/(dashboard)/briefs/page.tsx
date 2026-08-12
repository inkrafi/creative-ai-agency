"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import type { Brief, Invoice, Project } from "@/lib/types";

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs font-medium text-ink-muted">Pekerjaan</div>
        <h1 className="text-2xl font-bold text-ink">Brief</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Semua brief yang diajukan klien atau dibuat staff, di seluruh proyek.
        </p>
      </div>

      <Card className="p-0">
        {sorted === null ? (
          <p className="p-5 text-sm text-ink-muted">Memuat…</p>
        ) : sorted.length === 0 ? (
          <p className="p-5 text-sm text-ink-muted">Belum ada brief.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {sorted.map((b) => (
              <Link
                key={b.id}
                href={`/briefs/${b.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{b.title}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {projectNameById.get(b.projectId) ?? "Proyek tidak diketahui"} · {formatDate(b.createdAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge>{b.type === "WEBSITE" ? "Website" : "Desain"}</Badge>
                  <Badge tone={b.aiSuggestedPriceIdr !== null ? "success" : "warning"}>
                    {b.aiSuggestedPriceIdr !== null ? formatIdr(b.aiSuggestedPriceIdr) : "Belum diestimasi"}
                  </Badge>
                  <Badge tone={invoicedBriefIds.has(b.id) ? "success" : "neutral"}>
                    {invoicedBriefIds.has(b.id) ? "Invoice terkirim" : "Belum ada invoice"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
