"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, revisionClassificationLabel, revisionClassificationTone } from "@/lib/status";
import { Badge, Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import type { Task } from "@/lib/types";

export default function TaskDetailPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = use(params);
  const { user } = useAuth();
  const canManage = user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR";

  const [task, setTask] = useState<Task | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [deliverableNote, setDeliverableNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [classifyNote, setClassifyNote] = useState("");
  const [classifySubmitting, setClassifySubmitting] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  function load() {
    api<Task>(`/tasks/${id}`)
      .then(setTask)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }

  useEffect(load, [id]);

  async function handleSubmitForReview(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api(`/tasks/${id}/submit-for-review`, {
        method: "POST",
        body: JSON.stringify({ deliverableUrl, deliverableNote: deliverableNote || undefined }),
      });
      setDeliverableUrl("");
      setDeliverableNote("");
      load();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Gagal mengirim untuk direview.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClassify(requestId: string, billable: boolean) {
    setClassifySubmitting(true);
    setClassifyError(null);
    try {
      await api(`/tasks/${id}/revision-requests/${requestId}/classify`, {
        method: "PATCH",
        body: JSON.stringify({ billable, note: classifyNote || undefined }),
      });
      setClassifyingId(null);
      setClassifyNote("");
      load();
    } catch (err) {
      setClassifyError(err instanceof ApiError ? err.message : "Gagal menyimpan klasifikasi.");
    } finally {
      setClassifySubmitting(false);
    }
  }

  if (notFound) return <p className="text-sm text-ink-muted">Tugas tidak ditemukan.</p>;
  if (!task) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const canSubmitForReview = canManage && task.status !== "IN_REVIEW" && task.status !== "DONE";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/projects/${task.projectId}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink">{task.title}</h1>
          <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
          <span>
            Revisi {task.revisionsUsed}/{task.maxRevisions}
          </span>
          {task.briefId && (
            <Link href={`/briefs/${task.briefId}`} className="font-medium text-brand hover:underline">
              Lihat brief
            </Link>
          )}
        </div>
        {task.description && <p className="mt-1.5 text-sm text-ink-muted">{task.description}</p>}
      </div>

      {canSubmitForReview && (
        <Card>
          <SectionTitle>Kirim untuk direview klien</SectionTitle>
          <form onSubmit={handleSubmitForReview} className="flex flex-col gap-3">
            <div>
              <Label>Link hasil kerja</Label>
              <Input
                type="url"
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                required
                placeholder="https://staging.contoh.com/preview"
              />
            </div>
            <div>
              <Label>Catatan (opsional)</Label>
              <Textarea value={deliverableNote} onChange={(e) => setDeliverableNote(e.target.value)} rows={2} />
            </div>
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <Button type="submit" disabled={submitting} className="self-start">
              {submitting ? "Mengirim…" : "Kirim untuk Direview"}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle>Riwayat hasil kerja</SectionTitle>
        {task.deliverables.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada hasil kerja dikirim.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {task.deliverables.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                  >
                    Versi {d.version} <ExternalLinkIcon width={14} height={14} />
                  </a>
                  {d.note && <div className="text-xs text-ink-muted">{d.note}</div>}
                </div>
                <span className="shrink-0 text-xs text-ink-muted">{formatDate(d.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Riwayat permintaan revisi</SectionTitle>
        {task.revisionRequests.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada permintaan revisi.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {task.revisionRequests.map((r) => (
              <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-ink">Revisi #{r.round}</div>
                  <Badge tone={revisionClassificationTone(r.billable)}>{revisionClassificationLabel(r.billable)}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{r.note}</p>
                <div className="mt-0.5 text-xs text-ink-muted">{formatDate(r.createdAt)}</div>
                {r.classificationNote && <p className="mt-1 text-xs text-ink-muted">Catatan staff: {r.classificationNote}</p>}

                {canManage &&
                  r.billable === null &&
                  (classifyingId === r.id ? (
                    <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
                      <Label>Catatan (opsional)</Label>
                      <Textarea value={classifyNote} onChange={(e) => setClassifyNote(e.target.value)} rows={2} />
                      {classifyError && <p className="mt-1 text-sm text-danger">{classifyError}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" onClick={() => handleClassify(r.id, true)} disabled={classifySubmitting}>
                          Dihitung sebagai Jatah
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleClassify(r.id, false)}
                          disabled={classifySubmitting}
                        >
                          Gratis (Kesalahan Kami)
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setClassifyingId(null)}>
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => {
                        setClassifyingId(r.id);
                        setClassifyNote("");
                      }}
                    >
                      Klasifikasikan
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
