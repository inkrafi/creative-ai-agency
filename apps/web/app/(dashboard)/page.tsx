"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PAYMENT_TYPE_LABEL,
} from "@/lib/status";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { DeltaBadge, MethodBreakdown, RevenueAreaChart, type ChartPoint } from "@/components/charts";
import { AlertCircleIcon, ChevronRightIcon, ClockIcon, FolderIcon, WalletIcon } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";
import type { Payment, Project, ProjectSummary } from "@/lib/types";

type Period = 7 | 30;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

type FlatPayment = Payment & { projectName: string };

function flattenPayments(projects: Project[]): FlatPayment[] {
  return projects.flatMap((p) => p.payments.map((pay) => ({ ...pay, projectName: p.name })));
}

function sumInRange(payments: FlatPayment[], start: Date, end: Date) {
  return payments
    .filter((p) => {
      const t = new Date(p.createdAt);
      return t >= start && t < end;
    })
    .reduce((sum, p) => sum + p.amountIdr, 0);
}

function buildChartData(payments: FlatPayment[], period: Period, rangeStart: Date): ChartPoint[] {
  const bucketSizeDays = period <= 7 ? 1 : 3;
  const bucketCount = Math.ceil(period / bucketSizeDays);
  const points: ChartPoint[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = new Date(rangeStart);
    bucketStart.setDate(bucketStart.getDate() + i * bucketSizeDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketEnd.getDate() + bucketSizeDays);
    const label =
      bucketSizeDays === 1
        ? bucketStart.toLocaleDateString("id-ID", { weekday: "short" })
        : bucketStart.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    points.push({ label, value: sumInRange(payments, bucketStart, bucketEnd) });
  }
  return points;
}

function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  tone = "brand",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  delta?: number | null;
  tone?: "brand" | "warning";
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            tone === "warning" ? "bg-warning-bg text-warning" : "bg-brand-light text-brand"
          }`}
        >
          <Icon width={18} height={18} />
        </div>
        {delta !== undefined && <DeltaBadge percent={delta} />}
      </div>
      <div>
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      </div>
    </Card>
  );
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [period, setPeriod] = useState<Period>(30);

  useEffect(() => {
    function load() {
      void api<ProjectSummary>("/projects/summary").then(setSummary);
      void api<Project[]>("/projects").then(setProjects);
    }
    load();
    // Real polling, not a decorative label -- the dashboard is meant to sit
    // open on a staff member's screen while payments get recorded elsewhere.
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const allPayments = useMemo(() => flattenPayments(projects), [projects]);

  const { chartData, revenueDelta, methodItems, recentPayments } = useMemo(() => {
    const now = new Date();
    const currentStart = daysAgo(period - 1);
    const previousStart = daysAgo(period * 2 - 1);

    const currentRevenue = sumInRange(allPayments, currentStart, now);
    const previousRevenue = sumInRange(allPayments, previousStart, currentStart);
    const delta = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

    const inPeriod = allPayments.filter((p) => new Date(p.createdAt) >= currentStart);
    const byMethod = new Map<string, number>();
    for (const p of inPeriod) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountIdr);
    const methods = [...byMethod.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, amountIdr]) => ({
        label,
        amountIdr,
        percent: currentRevenue > 0 ? Math.round((amountIdr / currentRevenue) * 100) : 0,
      }));

    const recent = [...allPayments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      chartData: buildChartData(allPayments, period, currentStart),
      revenueDelta: delta,
      methodItems: methods,
      recentPayments: recent.slice(0, 6),
    };
  }, [allPayments, period]);

  const unpaidProjects = projects.filter((p) => p.paymentStatus === "UNPAID" || p.paymentStatus === "PARTIAL");

  const totalPendingAttention = summary
    ? summary.pendingPaymentVerifications + summary.pendingRevisionClassifications + summary.briefsAwaitingPrice
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-ink-muted">Utama / Ringkasan</div>
          <h1 className="font-display text-2xl font-semibold text-ink">Ringkasan</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-ink-muted sm:inline">Diperbarui setiap 30 detik</span>
          <div className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {([7, 30] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  period === p ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {p} Hari
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FolderIcon} label="Proyek Aktif" value={summary ? String(summary.activeProjects) : "—"} />
        <StatCard
          icon={ClockIcon}
          label="Menunggu Review Klien"
          value={summary ? String(summary.tasksInReview) : "—"}
        />
        <StatCard
          icon={WalletIcon}
          label="Total Pendapatan"
          value={summary ? formatIdr(summary.totalRevenueIdr) : "—"}
          delta={revenueDelta}
        />
        <StatCard
          icon={AlertCircleIcon}
          label="Belum Lunas"
          value={summary ? formatIdr(summary.outstandingIdr) : "—"}
          tone="warning"
        />
      </div>

      <div
        className={`rounded-2xl border p-4 transition-colors ${
          totalPendingAttention > 0 ? "border-warning/25 bg-warning-bg/40" : "border-border bg-surface-2/60"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Perlu Perhatian</span>
          {summary && (
            <span className="text-xs font-medium text-ink-muted">
              {totalPendingAttention > 0 ? `${totalPendingAttention} item` : "Semua beres"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/finance">
            <StatCard
              icon={WalletIcon}
              label="Verifikasi Pembayaran"
              value={summary ? String(summary.pendingPaymentVerifications) : "—"}
              tone={summary && summary.pendingPaymentVerifications > 0 ? "warning" : "brand"}
            />
          </Link>
          <StatCard
            icon={ClockIcon}
            label="Revisi Perlu Diklasifikasi"
            value={summary ? String(summary.pendingRevisionClassifications) : "—"}
            tone={summary && summary.pendingRevisionClassifications > 0 ? "warning" : "brand"}
          />
          <Link href="/briefs">
            <StatCard
              icon={AlertCircleIcon}
              label="Brief Belum Diestimasi"
              value={summary ? String(summary.briefsAwaitingPrice) : "—"}
              tone={summary && summary.briefsAwaitingPrice > 0 ? "warning" : "brand"}
            />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle>Pendapatan</SectionTitle>
          <RevenueAreaChart data={chartData} formatValue={formatIdr} />
        </Card>
        <Card>
          <SectionTitle>Metode Pembayaran</SectionTitle>
          <MethodBreakdown items={methodItems} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-0 xl:col-span-2">
          <div className="p-5 pb-0">
            <SectionTitle
              action={
                <Link href="/finance" className="flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                  Lihat semua <ChevronRightIcon width={16} height={16} />
                </Link>
              }
            >
              Pembayaran Terbaru
            </SectionTitle>
          </div>
          {recentPayments.length === 0 ? (
            <p className="p-5 pt-0 text-sm text-ink-muted">Belum ada pembayaran tercatat.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs font-medium text-ink-muted">
                    <th className="px-5 py-2.5 font-medium">Proyek</th>
                    <th className="px-3 py-2.5 font-medium">Tipe</th>
                    <th className="px-3 py-2.5 font-medium">Metode</th>
                    <th className="px-3 py-2.5 font-medium">Tanggal</th>
                    <th className="px-5 py-2.5 text-right font-medium">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentPayments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-surface-2">
                      <td className="max-w-[160px] truncate px-5 py-3 font-medium text-ink">{pay.projectName}</td>
                      <td className="px-3 py-3">
                        <Badge tone={pay.type === "PELUNASAN" ? "success" : "brand"}>
                          {PAYMENT_TYPE_LABEL[pay.type]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{pay.method}</td>
                      <td className="px-3 py-3 text-ink-muted">{formatDate(pay.createdAt)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">
                        {formatIdr(pay.amountIdr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="p-5 pb-0">
            <SectionTitle>Proyek Belum Lunas</SectionTitle>
          </div>
          {unpaidProjects.length === 0 ? (
            <p className="p-5 pt-0 text-sm text-ink-muted">Semua proyek yang punya harga sudah lunas.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {unpaidProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs tabular-nums text-ink-muted">
                      {formatIdr(p.totalPaidIdr)} / {formatIdr(p.totalPriceIdr ?? 0)}
                    </div>
                  </div>
                  <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
