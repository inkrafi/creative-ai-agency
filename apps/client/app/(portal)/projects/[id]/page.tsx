"use client";

import { use, useEffect, useRef, useState } from "react";
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
import { Badge, Button, Card, Input, Label, Select, SectionTitle, Textarea } from "@/components/ui";
import { ExternalLinkIcon, PlusIcon } from "@/components/icons";
import type { PaymentType, Project, RevisionRequestRecord, Task } from "@/lib/types";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const latestDeliverable = task.deliverables[0];

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      await api(`/tasks/${task.id}/approve`, { method: "POST" });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyetujui.");
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
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim revisi.");
    } finally {
      setSubmitting(false);
    }
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
          <Button type="button" onClick={approve} disabled={submitting}>
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
    </Card>
  );
}

export default function ProjectHubPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [paymentType, setPaymentType] = useState<PaymentType>("DP");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<Project>(`/projects/${id}`)
      .then(setProject)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
    void api<Task[]>(`/tasks?projectId=${id}`).then(setTasks);
  }

  useEffect(load, [id]);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!proofFile) return;
    setClaiming(true);
    setClaimError(null);
    setClaimed(false);
    try {
      const proofImageBase64 = await readAsDataUrl(proofFile);
      await api(`/projects/${id}/payments/claim`, {
        method: "POST",
        body: JSON.stringify({ type: paymentType, amountIdr: Number(paymentAmount), method: paymentMethod, note: paymentNote || undefined, proofImageBase64 }),
      });
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentNote("");
      setProofFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setClaimed(true);
      load();
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : "Gagal mengirim bukti pembayaran.");
    } finally {
      setClaiming(false);
    }
  }

  if (notFound) return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  if (!project) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;
  const needsReview = tasks.filter((t) => t.status === "IN_REVIEW");
  const otherTasks = tasks.filter((t) => t.status !== "IN_REVIEW");

  return (
    <div className="flex flex-col gap-6">
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
      </div>

      {needsReview.length > 0 && (
        <div className="flex flex-col gap-4">
          <SectionTitle>Menunggu keputusan Anda</SectionTitle>
          {needsReview.map((t) => (
            <TaskReviewCard key={t.id} task={t} onDone={load} />
          ))}
        </div>
      )}

      <Card>
        <SectionTitle>Pembayaran</SectionTitle>
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

            <form onSubmit={handleClaim} className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
              <Label>Catat pembayaran baru</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipe</Label>
                  <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)}>
                    {Object.entries(PAYMENT_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Jumlah (IDR)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required
                    placeholder="4000000"
                  />
                </div>
              </div>
              <div>
                <Label>Metode</Label>
                <Input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  required
                  placeholder="Transfer BCA"
                />
              </div>
              <div>
                <Label>Catatan (opsional)</Label>
                <Textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Bukti transfer (screenshot/foto)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-dark"
                />
              </div>
              {claimError && <p className="text-sm text-danger">{claimError}</p>}
              {claimed && (
                <p className="text-sm text-success">Bukti pembayaran terkirim, menunggu verifikasi tim Kravio.</p>
              )}
              <Button type="submit" disabled={claiming || !proofFile} className="self-start">
                {claiming ? "Mengirim…" : "Kirim Bukti Pembayaran"}
              </Button>
            </form>
          </>
        )}
      </Card>

      {project.payments.length > 0 && (
        <Card>
          <SectionTitle>Riwayat pembayaran</SectionTitle>
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

      {otherTasks.length > 0 && (
        <Card>
          <SectionTitle>Tugas lain</SectionTitle>
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
