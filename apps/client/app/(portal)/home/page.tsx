"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatIdr, formatRelative } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PROJECT_STATUS_LABEL } from "@/lib/status";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { SuccessDialog } from "@/components/success-dialog";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import type { Brief, Invoice, Project, Task } from "@/lib/types";

interface ActivityItem {
  id: string;
  timestamp: string;
  projectId: string;
  projectName: string;
  message: string;
  tone: "neutral" | "success" | "warning" | "danger";
  href?: string;
}

async function buildActivity(projects: Project[]): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  await Promise.all(
    projects.map(async (p) => {
      const [invoices, tasks, briefs] = await Promise.all([
        api<Invoice[]>(`/projects/${p.id}/invoices`),
        api<Task[]>(`/tasks?projectId=${p.id}`),
        api<Brief[]>(`/briefs?projectId=${p.id}`),
      ]);

      for (const b of briefs) {
        if (b.needsClarification) {
          items.push({
            id: `brief-clarification-${b.id}`,
            timestamp: b.updatedAt,
            projectId: p.id,
            projectName: p.name,
            message: `Tim Kravio butuh info tambahan soal "${b.title}"`,
            tone: "warning",
            href: `/projects/${p.id}/briefs/${b.id}`,
          });
        }
      }

      for (const inv of invoices) {
        items.push({
          id: `invoice-${inv.id}`,
          timestamp: inv.createdAt,
          projectId: p.id,
          projectName: p.name,
          message: `Invoice terkirim — ${formatIdr(inv.amountIdr)}`,
          tone: "neutral",
        });
      }

      for (const pay of p.payments) {
        if (pay.verificationStatus === "VERIFIED" && pay.verifiedAt) {
          items.push({
            id: `payment-verified-${pay.id}`,
            timestamp: pay.verifiedAt,
            projectId: p.id,
            projectName: p.name,
            message: `Pembayaran ${formatIdr(pay.amountIdr)} terverifikasi`,
            tone: "success",
          });
        } else if (pay.verificationStatus === "REJECTED" && pay.verifiedAt) {
          items.push({
            id: `payment-rejected-${pay.id}`,
            timestamp: pay.verifiedAt,
            projectId: p.id,
            projectName: p.name,
            message: `Pembayaran ${formatIdr(pay.amountIdr)} ditolak${pay.verificationNote ? `: ${pay.verificationNote}` : ""}`,
            tone: "danger",
          });
        }
      }

      for (const t of tasks) {
        if (t.status === "IN_REVIEW") {
          items.push({
            id: `task-review-${t.id}`,
            timestamp: t.updatedAt,
            projectId: p.id,
            projectName: p.name,
            message: `"${t.title}" siap untuk Anda review`,
            tone: "warning",
          });
        }
        for (const r of t.revisionRequests) {
          if (r.billable === false && r.classifiedAt) {
            items.push({
              id: `revision-free-${r.id}`,
              timestamp: r.classifiedAt,
              projectId: p.id,
              projectName: p.name,
              message: `Revisi #${r.round} pada "${t.title}" ditandai gratis -- tidak memotong jatah revisi Anda`,
              tone: "success",
            });
          }
        }
      }
    }),
  );

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items.slice(0, 12);
}

const ACTIVITY_DOT_TONE: Record<ActivityItem["tone"], string> = {
  neutral: "bg-ink-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export default function HomePage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  function load() {
    void api<Project[]>("/projects").then((list) => {
      setProjects(list);
      if (list.length > 0) void buildActivity(list).then(setActivity);
      else setActivity([]);
    });
  }

  useEffect(load, []);

  const hasProjects = useMemo(() => (projects?.length ?? 0) > 0, [projects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined }),
      });
      setName("");
      setDescription("");
      setShowForm(false);
      setCreatedProjectId(created.id);
      setSuccessOpen(true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat proyek.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
            <div className="text-xs font-medium text-white/60">Halo, {user?.email}</div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-balance text-white sm:text-3xl">
              Proyek Anda
            </h1>
            <p className="mt-1.5 text-sm text-white/70">
              {hasProjects
                ? `${projects?.length ?? 0} proyek terhubung dengan akun Anda.`
                : "Belum ada proyek -- mulai yang pertama sekarang."}
            </p>
          </div>
          <Button type="button" variant="accent" onClick={() => setShowForm((v) => !v)}>
            <PlusIcon width={16} height={16} />
            Proyek Baru
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <Label>Nama proyek</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Website Toko Kopi Senja" />
            </div>
            <div>
              <Label>Deskripsi (opsional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ringkasan singkat proyek ini"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Menyimpan…" : "Simpan"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Batal
              </Button>
            </div>
          </form>
        </Card>
      )}

      {projects === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : !hasProjects ? (
        <Card>
          <p className="text-sm text-ink-muted">Belum ada proyek. Buat proyek pertama Anda untuk mulai mengajukan brief.</p>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                {p.description && <div className="truncate text-xs text-ink-muted">{p.description}</div>}
                {p.totalPriceIdr !== null && (
                  <div className="mt-0.5 text-xs tabular-nums text-ink-muted">
                    {formatIdr(p.totalPaidIdr)} / {formatIdr(p.totalPriceIdr)}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
                <Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                <ChevronRightIcon width={16} height={16} className="text-ink-muted" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasProjects && (
        <Card>
          <SectionTitle>Aktivitas Terbaru</SectionTitle>
          {activity === null ? (
            <p className="text-sm text-ink-muted">Memuat…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada aktivitas untuk ditampilkan.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {activity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href ?? `/projects/${item.projectId}`}
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

      <SuccessDialog
        open={successOpen}
        title="Proyek berhasil dibuat!"
        message="Sekarang Anda bisa mengajukan brief untuk proyek ini kapan saja."
        actionLabel="Tutup"
        onClose={() => setSuccessOpen(false)}
        secondaryAction={createdProjectId ? { label: "Buka Proyek", href: `/projects/${createdProjectId}` } : undefined}
      />
    </div>
  );
}
