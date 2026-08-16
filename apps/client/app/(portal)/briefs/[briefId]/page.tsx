"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  revisionClassificationLabel,
  revisionClassificationTone,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  workStatus,
} from "@/lib/status";
import {
  Badge,
  Button,
  Card,
  Label,
  SectionTitle,
  Textarea,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SuccessDialog } from "@/components/success-dialog";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  HistoryIcon,
  WalletIcon,
} from "@/components/icons";
import type {
  Brief,
  BriefType,
  Project,
  RevisionRequestRecord,
  Task,
} from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = {
  LANDING_PAGE: "Landing Page",
  DESIGN: "Desain",
  VIDEO: "Video",
};

// Matches the Jenis column on the Brief table -- same service line, same
// hue, so a client learns the colour once.
const TYPE_TONE: Record<BriefType, "brand" | "accent" | "navy"> = {
  LANDING_PAGE: "brand",
  DESIGN: "accent",
  VIDEO: "navy",
};

// Indonesian labels for every context field across all three brief types
// (see apps/api/src/briefs/brief-context.ts for the source shapes) --
// prettifyKey() below is only a fallback for a key not listed here.
const CONTEXT_FIELD_LABEL: Record<string, string> = {
  businessType: "Bidang usaha",
  targetAudience: "Target audiens",
  painPoints: "Masalah yang ingin diselesaikan",
  goals: "Tujuan landing page",
  pagesNeeded: "Halaman yang diinginkan",
  toneStyle: "Gaya/tone",
  designType: "Jenis desain",
  purpose: "Tujuan",
  keyMessage: "Pesan utama",
  dimensions: "Ukuran/format",
  styleMood: "Gaya/mood visual",
  textToInclude: "Teks wajib",
  videoType: "Jenis video",
  duration: "Durasi",
  referenceLinks: "Referensi",
};

function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function RevisionHistory({ requests }: { requests: RevisionRequestRecord[] }) {
  if (requests.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-start justify-between gap-3 text-xs"
        >
          <div className="min-w-0">
            <span className="font-medium text-ink">Revisi #{r.round}:</span>{" "}
            <span className="text-ink-muted">{r.note}</span>
          </div>
          <Badge tone={revisionClassificationTone(r.billable)}>
            {revisionClassificationLabel(r.billable)}
          </Badge>
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
  const [successKind, setSuccessKind] = useState<"approve" | "revision" | null>(
    null,
  );
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
      await api(`/tasks/${task.id}/request-revision`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setShowRevisionForm(false);
      setNote("");
      setSuccessKind("revision");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal mengirim revisi.",
      );
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
        <Badge tone={TASK_STATUS_TONE[task.status]}>
          {TASK_STATUS_LABEL[task.status]}
        </Badge>
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
      {latestDeliverable?.note && (
        <p className="mt-1 text-xs text-ink-muted">{latestDeliverable.note}</p>
      )}

      <RevisionHistory requests={task.revisionRequests} />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {!showRevisionForm ? (
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
          >
            Setujui
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowRevisionForm(true)}
            disabled={submitting}
          >
            Minta Revisi
          </Button>
        </div>
      ) : (
        <form onSubmit={requestRevision} className="mt-4 flex flex-col gap-2">
          <Label>Apa yang perlu diubah?</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            rows={3}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || note.trim() === ""}>
              {submitting ? "Mengirim…" : "Kirim Permintaan Revisi"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowRevisionForm(false)}
              disabled={submitting}
            >
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
        title={
          successKind === "approve"
            ? "Berhasil disetujui!"
            : "Permintaan revisi terkirim!"
        }
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

export default function BriefWorkspacePage({
  params,
}: PageProps<"/briefs/[briefId]">) {
  const { briefId } = use(params);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notFound, setNotFound] = useState(false);

  function load() {
    api<Brief>(`/briefs/${briefId}`)
      .then((b) => {
        setBrief(b);
        void api<Project>(`/projects/${b.projectId}`).then(setProject);
        void api<Task[]>(`/tasks?projectId=${b.projectId}`).then(setTasks);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }

  useEffect(load, [briefId]);

  if (notFound)
    return <p className="text-sm text-ink-muted">Brief tidak ditemukan.</p>;
  if (!brief || !project)
    return <p className="text-sm text-ink-muted">Memuat…</p>;

  const needsReview = tasks.filter((t) => t.status === "IN_REVIEW");
  const allTasksDone = tasks.length > 0 && tasks.every((t) => t.status === "DONE");
  // Once a task is approved it leaves needsReview (and its TaskReviewCard,
  // the only other place a deliverable link renders) -- this is what lets
  // the client actually get to their finished work afterwards.
  const finishedDeliverables = tasks
    .filter((t) => t.status === "DONE" && t.deliverables.length > 0)
    .map((t) => ({ task: t, deliverable: t.deliverables[0] }));
  // Revisions tied to tasks currently IN_REVIEW already show inside their
  // TaskReviewCard -- this is every revision ever requested on this brief,
  // so past rounds stay visible after their task moves on (e.g. gets
  // approved or a later revision starts a new round).
  const allRevisions = tasks
    .flatMap((t) => t.revisionRequests)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const remaining =
    project.totalPriceIdr !== null
      ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0)
      : null;
  const status = workStatus({
    totalPriceIdr: project.totalPriceIdr,
    paymentStatus: project.paymentStatus,
    taskStatuses: tasks.map((t) => t.status),
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link
          href="/briefs"
          className="text-xs font-medium text-ink-muted hover:text-ink"
        >
          ← Brief
        </Link>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink">{brief.title}</h1>
          <Badge tone={TYPE_TONE[brief.type]}>{TYPE_LABEL[brief.type]}</Badge>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">{status.description}</p>
      </div>

      {finishedDeliverables.length > 0 && (
        <Card className="border-success/30 bg-success-bg/40">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <CheckCircleIcon width={16} height={16} className="text-success" />
              Hasil Kerja
            </span>
          </SectionTitle>
          <div className="flex flex-col gap-3">
            {finishedDeliverables.map(({ task, deliverable }) => (
              <div key={task.id}>
                <a
                  href={deliverable.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                >
                  Lihat/Unduh Hasil Kerja <ExternalLinkIcon width={14} height={14} />
                </a>
                {deliverable.note && (
                  <p className="mt-1 text-sm text-ink-muted">{deliverable.note}</p>
                )}
                <div className="mt-1 text-xs text-ink-muted">
                  Versi {deliverable.version} · {formatDate(deliverable.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {needsReview.length > 0 && (
        <div className="flex flex-col gap-4">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <AlertCircleIcon
                width={16}
                height={16}
                className="text-warning"
              />
              Menunggu keputusan Anda
            </span>
          </SectionTitle>
          {needsReview.map((t) => (
            <TaskReviewCard key={t.id} task={t} onDone={load} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle>Detail Brief</SectionTitle>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(brief.context).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs font-medium text-ink-muted">
                    {CONTEXT_FIELD_LABEL[key] ?? prettifyKey(key)}
                  </dt>
                  <dd className="text-sm text-ink">{String(value) || "—"}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {allRevisions.length > 0 && (
            <Card>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <HistoryIcon width={16} height={16} className="text-brand" />
                  Riwayat Revisi
                </span>
              </SectionTitle>
              <div className="flex flex-col divide-y divide-border">
                {allRevisions.map((r) => (
                  <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">Revisi #{r.round}</div>
                        <p className="mt-0.5 text-sm text-ink-muted">{r.note}</p>
                        <div className="mt-1 text-xs text-ink-muted">{formatDate(r.createdAt)}</div>
                      </div>
                      <Badge tone={revisionClassificationTone(r.billable)}>
                        {revisionClassificationLabel(r.billable)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card className="lg:sticky lg:top-6">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <WalletIcon width={16} height={16} className="text-brand" />
              Pembayaran
            </span>
          </SectionTitle>

          {project.totalPriceIdr === null ? (
            <p className="text-sm text-ink-muted">
              Harga belum ditentukan. Menunggu invoice dari tim Kravio.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-ink-muted">Total harga</div>
                  <div className="font-semibold tabular-nums text-ink">
                    {formatIdr(project.totalPriceIdr)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Sudah dibayar</div>
                  <div
                    className={`font-semibold tabular-nums ${project.totalPaidIdr > 0 ? "text-success" : "text-ink"}`}
                  >
                    {formatIdr(project.totalPaidIdr)}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-ink-muted">Sisa</div>
                  <div
                    className={`font-semibold tabular-nums ${remaining !== null && remaining > 0 ? "text-warning" : "text-success"}`}
                  >
                    {remaining !== null ? formatIdr(remaining) : "—"}
                  </div>
                </div>
              </div>
              {project.minDpPercent !== null && (
                <p className="mt-3 text-xs text-ink-muted">
                  DP minimal yang disarankan: {project.minDpPercent}% (
                  {formatIdr(
                    Math.round(
                      (project.totalPriceIdr * project.minDpPercent) / 100,
                    ),
                  )}
                  ).
                </p>
              )}

              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  project.paymentStatus === "PAID"
                    ? "border-success/30 bg-success-bg text-success"
                    : "border-warning/30 bg-warning-bg text-warning"
                }`}
              >
                {project.paymentStatus === "PAID"
                  ? "Pembayaran lunas. Terima kasih!"
                  : project.paymentStatus === "PARTIAL"
                    ? allTasksDone
                      ? "DP sudah diterima -- brief ini sudah selesai dikerjakan, silakan lunasi sisa pembayaran."
                      : "DP sudah diterima -- tim Kravio sedang mengerjakan brief ini. Pelunasan bisa dilakukan setelah pekerjaan selesai."
                    : "Anda belum melakukan pembayaran untuk brief ini."}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={PAYMENT_STATUS_TONE[project.paymentStatus]}>
                  {PAYMENT_STATUS_LABEL[project.paymentStatus]}
                </Badge>
              </div>

              {/* UNPAID: pay any time. PARTIAL: only once the work is
                  actually done -- no reason to prompt for the final
                  payment while the brief is still being worked on. PAID:
                  nothing left to pay, no button. */}
              {(project.paymentStatus === "UNPAID" ||
                (project.paymentStatus === "PARTIAL" && allTasksDone)) && (
                <Link
                  href={`/projects/${project.id}/payment`}
                  className="mt-3 block"
                >
                  <Button type="button" className="w-full justify-center">
                    {project.paymentStatus === "UNPAID" ? "Bayar Sekarang" : "Lunasi Sekarang"}
                  </Button>
                </Link>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
