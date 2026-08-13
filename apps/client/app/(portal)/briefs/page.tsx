"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { briefStatus } from "@/lib/status";
import { Badge, Button, Card } from "@/components/ui";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import type { Brief, BriefType } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { LANDING_PAGE: "Landing Page", DESIGN: "Desain", VIDEO: "Video" };

export default function BriefsListPage() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);

  useEffect(() => {
    void api<Brief[]>("/briefs").then(setBriefs);
  }, []);

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
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {briefs.map((b) => {
              const status = briefStatus(b.needsClarification);
              return (
                <Link
                  key={b.id}
                  href={`/briefs/${b.id}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-ink">{b.title}</div>
                      <Badge>{TYPE_LABEL[b.type]}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">{formatDate(b.createdAt)}</div>
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
