"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatIdr } from "@/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  revisionClassificationLabel,
  revisionClassificationTone,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  workStatus,
} from "@/lib/status";
import { Badge, Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SuccessDialog } from "@/components/success-dialog";
import { AlertCircleIcon, ExternalLinkIcon, FolderIcon, WalletIcon } from "@/components/icons";
import type { Brief, BriefType, Project, RevisionRequestRecord, Task } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { LANDING_PAGE: "Landing Page", DESIGN: "Desain", VIDEO: "Video" };

function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

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

export default function BriefWorkspacePage({ params }: PageProps<"/briefs/[briefId]">) {
  const { briefId } = use(params);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [businessType, setBusinessType] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [goals, setGoals] = useState("");
  const [pagesNeeded, setPagesNeeded] = useState("");
  const [toneStyle, setToneStyle] = useState("");

  const [designType, setDesignType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [styleMood, setStyleMood] = useState("");
  const [textToInclude, setTextToInclude] = useState("");

  const [videoType, setVideoType] = useState("");
  const [videoPurpose, setVideoPurpose] = useState("");
  const [duration, setDuration] = useState("");
  const [videoKeyMessage, setVideoKeyMessage] = useState("");
  const [videoStyleMood, setVideoStyleMood] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentOpen, setSentOpen] = useState(false);

  function load() {
    api<Brief>(`/briefs/${briefId}`)
      .then((b) => {
        setBrief(b);
        const c = b.context as Record<string, string | undefined>;
        if (b.type === "LANDING_PAGE") {
          setBusinessType(c.businessType ?? "");
          setTargetAudience(c.targetAudience ?? "");
          setPainPoints(c.painPoints ?? "");
          setGoals(c.goals ?? "");
          setPagesNeeded(c.pagesNeeded ?? "");
          setToneStyle(c.toneStyle ?? "");
        } else if (b.type === "DESIGN") {
          setDesignType(c.designType ?? "");
          setPurpose(c.purpose ?? "");
          setKeyMessage(c.keyMessage ?? "");
          setDimensions(c.dimensions ?? "");
          setStyleMood(c.styleMood ?? "");
          setTextToInclude(c.textToInclude ?? "");
        } else {
          setVideoType(c.videoType ?? "");
          setVideoPurpose(c.purpose ?? "");
          setDuration(c.duration ?? "");
          setVideoKeyMessage(c.keyMessage ?? "");
          setVideoStyleMood(c.styleMood ?? "");
          setReferenceLinks(c.referenceLinks ?? "");
        }
        void api<Project>(`/projects/${b.projectId}`).then(setProject);
        void api<Task[]>(`/tasks?projectId=${b.projectId}`).then(setTasks);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }

  useEffect(load, [briefId]);

  async function handleRespond(e: React.FormEvent) {
    e.preventDefault();
    if (!brief) return;
    setSubmitting(true);
    setError(null);
    try {
      const context =
        brief.type === "LANDING_PAGE"
          ? {
              businessType,
              targetAudience,
              painPoints,
              goals,
              pagesNeeded: pagesNeeded || undefined,
              toneStyle: toneStyle || undefined,
            }
          : brief.type === "DESIGN"
            ? {
                designType,
                purpose,
                keyMessage,
                dimensions: dimensions || undefined,
                styleMood: styleMood || undefined,
                textToInclude: textToInclude || undefined,
              }
            : {
                videoType,
                purpose: videoPurpose,
                duration,
                keyMessage: videoKeyMessage,
                styleMood: videoStyleMood || undefined,
                referenceLinks: referenceLinks || undefined,
              };
      await api(`/briefs/${briefId}`, { method: "PATCH", body: JSON.stringify({ context }) });
      setSentOpen(true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim jawaban.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) return <p className="text-sm text-ink-muted">Brief tidak ditemukan.</p>;
  if (!brief || !project) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const needsReview = tasks.filter((t) => t.status === "IN_REVIEW");
  const otherTasks = tasks.filter((t) => t.status !== "IN_REVIEW");
  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;
  const status = workStatus({
    needsClarification: brief.needsClarification,
    totalPriceIdr: project.totalPriceIdr,
    paymentStatus: project.paymentStatus,
    taskStatuses: tasks.map((t) => t.status),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/briefs" className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Brief
        </Link>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink">{brief.title}</h1>
          <Badge>{TYPE_LABEL[brief.type]}</Badge>
        </div>
        <div className="mt-2">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      {brief.needsClarification && (
        <>
          <Card className="border-warning/40 bg-warning-bg/40">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <AlertCircleIcon width={16} height={16} className="text-warning" />
                Tim Kravio butuh info tambahan
              </span>
            </SectionTitle>
            <p className="text-sm text-ink">{brief.clarificationNote}</p>
          </Card>

          <Card>
            <SectionTitle>Perbarui brief Anda</SectionTitle>
            <form onSubmit={handleRespond} className="flex flex-col gap-4">
              {brief.type === "LANDING_PAGE" ? (
                <>
                  <div>
                    <Label>Bidang usaha</Label>
                    <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Target audiens</Label>
                    <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Masalah yang ingin diselesaikan</Label>
                    <Textarea value={painPoints} onChange={(e) => setPainPoints(e.target.value)} required rows={2} />
                  </div>
                  <div>
                    <Label>Tujuan landing page</Label>
                    <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} required rows={2} />
                  </div>
                  <div>
                    <Label>Halaman yang diinginkan (opsional)</Label>
                    <Input value={pagesNeeded} onChange={(e) => setPagesNeeded(e.target.value)} />
                  </div>
                  <div>
                    <Label>Gaya/tone (opsional)</Label>
                    <Input value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} />
                  </div>
                </>
              ) : brief.type === "DESIGN" ? (
                <>
                  <div>
                    <Label>Jenis desain</Label>
                    <Input value={designType} onChange={(e) => setDesignType(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Tujuan</Label>
                    <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} required rows={2} />
                  </div>
                  <div>
                    <Label>Pesan utama</Label>
                    <Textarea value={keyMessage} onChange={(e) => setKeyMessage(e.target.value)} required rows={2} />
                  </div>
                  <div>
                    <Label>Ukuran/format (opsional)</Label>
                    <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
                  </div>
                  <div>
                    <Label>Gaya/mood visual (opsional)</Label>
                    <Input value={styleMood} onChange={(e) => setStyleMood(e.target.value)} />
                  </div>
                  <div>
                    <Label>Teks wajib (opsional)</Label>
                    <Textarea value={textToInclude} onChange={(e) => setTextToInclude(e.target.value)} rows={2} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Jenis video</Label>
                    <Input value={videoType} onChange={(e) => setVideoType(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Tujuan</Label>
                    <Textarea value={videoPurpose} onChange={(e) => setVideoPurpose(e.target.value)} required rows={2} />
                  </div>
                  <div>
                    <Label>Durasi</Label>
                    <Input value={duration} onChange={(e) => setDuration(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Pesan utama</Label>
                    <Textarea value={videoKeyMessage} onChange={(e) => setVideoKeyMessage(e.target.value)} required rows={2} />
                  </div>
                  <div>
                    <Label>Gaya/mood visual (opsional)</Label>
                    <Input value={videoStyleMood} onChange={(e) => setVideoStyleMood(e.target.value)} />
                  </div>
                  <div>
                    <Label>Referensi (opsional)</Label>
                    <Textarea value={referenceLinks} onChange={(e) => setReferenceLinks(e.target.value)} rows={2} />
                  </div>
                </>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={submitting} className="self-start">
                {submitting ? "Mengirim…" : "Kirim Jawaban"}
              </Button>
            </form>
          </Card>
        </>
      )}

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

      {project.totalPriceIdr !== null && (
        <Card>
          <SectionTitle
            action={
              <Link href={`/projects/${project.id}/payment`}>
                <Button type="button">Bayar Sekarang</Button>
              </Link>
            }
          >
            <span className="flex items-center gap-2">
              <WalletIcon width={16} height={16} className="text-brand" />
              Pembayaran
            </span>
          </SectionTitle>
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
              {formatIdr(Math.round((project.totalPriceIdr * project.minDpPercent) / 100))}). Ini hanya pemberitahuan,
              bukan batas yang mengunci jumlah pembayaran Anda.
            </p>
          )}
          <div className="mt-2">
            <Badge tone={PAYMENT_STATUS_TONE[project.paymentStatus]}>{PAYMENT_STATUS_LABEL[project.paymentStatus]}</Badge>
          </div>
        </Card>
      )}

      {!brief.needsClarification && (
        <Card>
          <SectionTitle>Detail brief</SectionTitle>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(brief.context).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium text-ink-muted">{prettifyKey(key)}</dt>
                <dd className="text-sm text-ink">{String(value) || "—"}</dd>
              </div>
            ))}
          </dl>
          {brief.clarificationNote && (
            <p className="mt-4 border-t border-border pt-4 text-xs text-ink-muted">
              Pertanyaan sebelumnya dari tim Kravio: {brief.clarificationNote}
            </p>
          )}
        </Card>
      )}

      {otherTasks.length > 0 && (
        <Card>
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

      <SuccessDialog
        open={sentOpen}
        title="Jawaban terkirim!"
        message="Tim Kravio akan meninjau ulang brief Anda."
        onClose={() => setSentOpen(false)}
      />
    </div>
  );
}
