"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PAYMENT_TYPE_LABEL,
  PAYMENT_VERIFICATION_LABEL,
  PAYMENT_VERIFICATION_TONE,
  revisionClassificationLabel,
  revisionClassificationTone,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
} from "@/lib/status";
import { Badge, Button, Card, Label, SectionTitle, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SuccessDialog } from "@/components/success-dialog";
import {
  AlertCircleIcon,
  ClockIcon,
  DocumentIcon,
  ExternalLinkIcon,
  FolderIcon,
  PlusIcon,
  WalletIcon,
} from "@/components/icons";
import type { Brief, Invoice, Project, RevisionRequestRecord, Task } from "@/lib/types";

function RevisionHistory({ requests }: { requests: RevisionRequestRecord[] }) {
  if (requests.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      {requests.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-3 text-xs">
          <div className="min-w-0">
            <span className="font-medium text-ink">Revisi #{r.round}:</span>{" "}
            <span className="text-ink-muted">{r.note}</span>
          </div>
          <Badge tone={revisionClassificationTone(r.billable)}>{revisionClassificationLabel(r.billable)}</Badge>
        </div>
      ))}
    </div>
  );
}

function TaskReviewCard({ task, onDone }: { task: Task; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successKind, setSuccessKind] = useState<"approve" | "revision" | null>(null);
  const latestDeliverable = task.deliverables[0];

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      await api(`/tasks/${task.id}/approve`, { method: "POST" });
      setConfirmOpen(false);
      setSuccessKind("approve");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyetujui.");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestRevision(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api(`/tasks/${task.id}/request-revision`, { method: "POST", body: JSON.stringify({ note }) });
      setShowRevisionForm(false);
      setNote("");
      setSuccessKind("revision");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim revisi.");
    } finally {
      setSubmitting(false);
    }
  }

  // Reload deferred until the success modal is dismissed -- otherwise the
  // card (and the modal sitting on top of it) would vanish out from under
  // the client the instant the request finished, since a successful
  // approve/request-revision always moves this task out of needsReview.
  function closeSuccess() {
    setSuccessKind(null);
    onDone();
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{task.title}</div>
          <div className="text-xs text-ink-muted">
            Revisi {task.revisionsUsed}/{task.maxRevisions}
          </div>
        </div>
        <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
      </div>

      {latestDeliverable && (
        <a
          href={latestDeliverable.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          Lihat hasil kerja <ExternalLinkIcon width={14} height={14} />
        </a>
      )}
      {latestDeliverable?.note && <p className="mt-1 text-xs text-ink-muted">{latestDeliverable.note}</p>}

      <RevisionHistory requests={task.revisionRequests} />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {!showRevisionForm ? (
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={submitting}>
            Setujui
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowRevisionForm(true)} disabled={submitting}>
            Minta Revisi
          </Button>
        </div>
      ) : (
        <form onSubmit={requestRevision} className="mt-4 flex flex-col gap-2">
          <Label>Apa yang perlu diubah?</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} required rows={3} />
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || note.trim() === ""}>
              {submitting ? "Mengirim…" : "Kirim Permintaan Revisi"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowRevisionForm(false)} disabled={submitting}>
              Batal
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Setujui hasil kerja ini?"
        message="Setelah disetujui, tugas ini akan ditandai selesai dan Anda tidak bisa lagi meminta revisi untuk tugas ini."
        confirmLabel="Ya, Setujui"
        submitting={submitting}
        onConfirm={approve}
        onCancel={() => setConfirmOpen(false)}
      />
      <SuccessDialog
        open={successKind !== null}
        title={successKind === "approve" ? "Berhasil disetujui!" : "Permintaan revisi terkirim!"}
        message={
          successKind === "approve"
            ? "Terima kasih! Tugas ini sekarang ditandai selesai."
            : "Tim Kravio akan meninjau permintaan Anda dan mulai mengerjakannya."
        }
        onClose={closeSuccess}
      />
    </Card>
  );
}

export default function ProjectHubPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notFound, setNotFound] = useState(false);

  function load() {
    api<Project>(`/projects/${id}`)
      .then(setProject)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
    void api<Task[]>(`/tasks?projectId=${id}`).then(setTasks);
    void api<Brief[]>(`/briefs?projectId=${id}`).then(setBriefs);
    void api<Invoice[]>(`/projects/${id}/invoices`).then(setInvoices);
  }

  useEffect(load, [id]);

  if (notFound) return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  if (!project) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;
  const needsReview = tasks.filter((t) => t.status === "IN_REVIEW");
  const otherTasks = tasks.filter((t) => t.status !== "IN_REVIEW");

  const sections = [
    { id: "pembayaran", label: "Pembayaran" },
    ...(project.payments.length > 0 ? [{ id: "riwayat-pembayaran", label: "Riwayat Pembayaran" }] : []),
    ...(invoices.length > 0 ? [{ id: "riwayat-invoice", label: "Invoice" }] : []),
    ...(otherTasks.length > 0 ? [{ id: "tugas-lain", label: "Tugas" }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/home" className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Semua proyek
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
          <Link href={`/projects/${id}/briefs/new`}>
            <Button type="button">
              <PlusIcon width={16} height={16} />
              Ajukan Brief
            </Button>
          </Link>
        </div>
        {project.description && <p className="mt-1.5 text-sm text-ink-muted">{project.description}</p>}
        {project.targetCompletionDate && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Target selesai: <span className="font-medium text-ink">{formatDate(project.targetCompletionDate)}</span>
          </p>
        )}
        {sections.length > 1 && (
          <nav className="mt-4 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-brand hover:text-brand"
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      {briefs
        .filter((b) => b.needsClarification)
        .map((b) => (
          <Link key={b.id} href={`/projects/${id}/briefs/${b.id}`}>
            <Card className="border-warning/40 bg-warning-bg/40">
              <div className="text-sm font-semibold text-ink">Tim Kravio butuh info tambahan soal &quot;{b.title}&quot;</div>
              <p className="mt-1 text-sm text-ink-muted">{b.clarificationNote}</p>
              <p className="mt-2 text-xs font-medium text-brand">Jawab sekarang →</p>
            </Card>
          </Link>
        ))}

      {needsReview.length > 0 && (
        <div className="flex flex-col gap-4">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <AlertCircleIcon width={16} height={16} className="text-warning" />
              Menunggu keputusan Anda
            </span>
          </SectionTitle>
          {needsReview.map((t) => (
            <TaskReviewCard key={t.id} task={t} onDone={load} />
          ))}
        </div>
      )}

      <Card id="pembayaran">
        <SectionTitle
          action={
            project.totalPriceIdr !== null && (
              <div className="flex gap-2">
                {invoices.length > 0 && (
                  <Link href={`/projects/${id}/invoice`}>
                    <Button type="button" variant="ghost">
                      Lihat Invoice
                    </Button>
                  </Link>
                )}
                <Link href={`/projects/${id}/payment`}>
                  <Button type="button">Bayar Sekarang</Button>
                </Link>
              </div>
            )
          }
        >
          <span className="flex items-center gap-2">
            <WalletIcon width={16} height={16} className="text-brand" />
            Pembayaran
          </span>
        </SectionTitle>
        {project.totalPriceIdr === null ? (
          <p className="text-sm text-ink-muted">Harga proyek belum ditentukan. Menunggu invoice dari Kravio.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-ink-muted">Total harga</div>
                <div className="font-semibold tabular-nums text-ink">{formatIdr(project.totalPriceIdr)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Sudah dibayar</div>
                <div className="font-semibold tabular-nums text-ink">{formatIdr(project.totalPaidIdr)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Sisa</div>
                <div className="font-semibold tabular-nums text-ink">{remaining !== null ? formatIdr(remaining) : "—"}</div>
              </div>
            </div>
            {project.minDpPercent !== null && (
              <p className="mt-3 text-xs text-ink-muted">
                DP minimal yang disarankan: {project.minDpPercent}% (
                {formatIdr(Math.round((project.totalPriceIdr * project.minDpPercent) / 100))}). Ini hanya
                pemberitahuan, bukan batas yang mengunci jumlah pembayaran Anda.
              </p>
            )}
            <div className="mt-2">
              <Badge tone={PAYMENT_STATUS_TONE[project.paymentStatus]}>{PAYMENT_STATUS_LABEL[project.paymentStatus]}</Badge>
            </div>
          </>
        )}
      </Card>

      {project.payments.length > 0 && (
        <Card id="riwayat-pembayaran">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <ClockIcon width={16} height={16} className="text-brand" />
              Riwayat pembayaran
            </span>
          </SectionTitle>
          <div className="flex flex-col divide-y divide-border">
            {project.payments.map((pay) => (
              <div key={pay.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {PAYMENT_TYPE_LABEL[pay.type]} · {pay.method}
                  </div>
                  <div className="text-xs text-ink-muted">{formatDate(pay.createdAt)}</div>
                  {pay.verificationStatus === "REJECTED" && pay.verificationNote && (
                    <div className="mt-0.5 text-xs text-danger">Alasan: {pay.verificationNote}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-ink">{formatIdr(pay.amountIdr)}</span>
                  <Badge tone={PAYMENT_VERIFICATION_TONE[pay.verificationStatus]}>
                    {PAYMENT_VERIFICATION_LABEL[pay.verificationStatus]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card id="riwayat-invoice">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <DocumentIcon width={16} height={16} className="text-brand" />
              Riwayat invoice
            </span>
          </SectionTitle>
          <div className="flex flex-col divide-y divide-border">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{formatIdr(inv.amountIdr)}</div>
                  <div className="text-xs text-ink-muted">
                    {formatDate(inv.createdAt)}
                    {inv.minDpPercent !== null ? ` — DP minimal ${inv.minDpPercent}%` : ""}
                  </div>
                  {inv.note && <div className="mt-0.5 text-xs text-ink-muted">{inv.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {otherTasks.length > 0 && (
        <Card id="tugas-lain">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <FolderIcon width={16} height={16} className="text-brand" />
              Tugas lain
            </span>
          </SectionTitle>
          <div className="flex flex-col divide-y divide-border">
            {otherTasks.map((t) => (
              <div key={t.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                  <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                </div>
                <RevisionHistory requests={t.revisionRequests} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
