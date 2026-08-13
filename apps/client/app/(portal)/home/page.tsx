"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/format";
import { briefStatus } from "@/lib/status";
import { useAuth } from "@/lib/auth";
import { ACTIVITY_DOT_TONE, buildActivity, type ActivityItem } from "@/lib/activity";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { ChevronRightIcon, ClockIcon, DocumentIcon, PlusIcon } from "@/components/icons";
import type { Brief, BriefType, Project } from "@/lib/types";

const RECENT_BRIEFS_LIMIT = 3;
const TYPE_LABEL: Record<BriefType, string> = { LANDING_PAGE: "Landing Page", DESIGN: "Desain", VIDEO: "Video" };

export default function HomePage() {
  const { profile, user } = useAuth();
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    void api<Brief[]>("/briefs").then(setBriefs);
    void api<Project[]>("/projects").then((list) => {
      if (list.length > 0) void buildActivity(list, 8).then(setActivity);
      else setActivity([]);
    });
  }, []);

  const hasBriefs = useMemo(() => (briefs?.length ?? 0) > 0, [briefs]);
  const needsResponseCount = useMemo(() => briefs?.filter((b) => b.needsClarification).length ?? 0, [briefs]);
  const needsAttentionCount = useMemo(
    () => activity?.filter((a) => a.tone === "warning" || a.tone === "danger").length ?? 0,
    [activity],
  );
  const displayName = profile?.name ?? user?.email ?? "";
  const recentBriefs = briefs?.slice(0, RECENT_BRIEFS_LIMIT) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-light via-navy to-[#061f38] px-6 py-7 sm:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-accent/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-brand/30 blur-3xl"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-white/60">Selamat datang kembali</div>
              <h1 className="mt-1 font-display text-2xl font-semibold text-balance text-white sm:text-3xl">
                Halo, {displayName}
              </h1>
              <p className="mt-1.5 text-sm text-white/70">
                {hasBriefs
                  ? "Berikut ringkasan terbaru dari brief-brief Anda bersama Kravio."
                  : "Belum ada brief -- ajukan yang pertama sekarang."}
              </p>
            </div>
            <Link href="/briefs/new">
              <Button type="button" variant="accent">
                <PlusIcon width={16} height={16} />
                Brief Baru
              </Button>
            </Link>
          </div>
        </div>

        {briefs === null ? (
          <p className="text-sm text-ink-muted">Memuat…</p>
        ) : !hasBriefs ? (
          <Card>
            <p className="text-sm text-ink-muted">
              Belum ada brief. <Link href="/briefs/new" className="font-medium text-brand hover:underline">Ajukan brief pertama Anda</Link> untuk mulai.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Card className="flex flex-col gap-1">
                <div className="text-xs font-medium text-ink-muted">Total Brief</div>
                <div className="text-2xl font-semibold tabular-nums text-ink">{briefs.length}</div>
              </Card>
              <Card className="flex flex-col gap-1">
                <div className="text-xs font-medium text-ink-muted">Butuh Respons</div>
                <div className={`text-2xl font-semibold tabular-nums ${needsResponseCount > 0 ? "text-warning" : "text-ink"}`}>
                  {needsResponseCount}
                </div>
              </Card>
              <Card className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <div className="text-xs font-medium text-ink-muted">Perlu Perhatian</div>
                <div className={`text-2xl font-semibold tabular-nums ${needsAttentionCount > 0 ? "text-warning" : "text-ink"}`}>
                  {needsAttentionCount}
                </div>
              </Card>
            </div>

            <Card>
              <SectionTitle
                action={
                  <Link href="/briefs" className="text-xs font-medium text-brand hover:underline">
                    Lihat semua
                  </Link>
                }
              >
                <span className="flex items-center gap-2">
                  <DocumentIcon width={16} height={16} className="text-brand" />
                  Brief Terbaru
                </span>
              </SectionTitle>
              <div className="flex flex-col divide-y divide-border">
                {recentBriefs.map((b) => {
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
          </>
        )}
      </div>

      {hasBriefs && (
        <Card className="lg:sticky lg:top-6">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <ClockIcon width={16} height={16} className="text-brand" />
              Aktivitas Terbaru
            </span>
          </SectionTitle>
          {activity === null ? (
            <p className="text-sm text-ink-muted">Memuat…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada aktivitas untuk ditampilkan.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {activity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-2"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_TONE[item.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{item.message}</div>
                    <div className="text-xs text-ink-muted">
                      {item.projectName} · {formatRelative(item.timestamp)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
