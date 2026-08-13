"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { briefStatus } from "@/lib/status";
import { Badge, Card } from "@/components/ui";
import { ChevronRightIcon } from "@/components/icons";
import type { Brief, BriefType } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { WEBSITE: "Website", DESIGN: "Desain" };

export default function BriefsListPage() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);

  useEffect(() => {
    void api<Brief[]>("/briefs").then(setBriefs);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Brief</h1>
        <p className="mt-1 text-sm text-ink-muted">Semua brief yang pernah Anda ajukan, dari seluruh proyek.</p>
      </div>

      {briefs === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : briefs.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Belum ada brief yang diajukan. Buka salah satu{" "}
            <Link href="/projects" className="font-medium text-brand hover:underline">
              proyek Anda
            </Link>{" "}
            untuk mengajukan brief baru.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {briefs.map((b) => {
              const status = briefStatus(b.needsClarification);
              return (
                <Link
                  key={b.id}
                  href={`/projects/${b.projectId}/briefs/${b.id}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-ink">{b.title}</div>
                      <Badge>{TYPE_LABEL[b.type]}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-muted">
                      {b.project?.name ?? "Proyek"} · {formatDate(b.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <ChevronRightIcon width={16} height={16} className="text-ink-muted" />
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
