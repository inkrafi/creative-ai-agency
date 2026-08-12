"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatIdr } from "@/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PAYMENT_TYPE_LABEL,
  PAYMENT_VERIFICATION_LABEL,
  PAYMENT_VERIFICATION_TONE,
  PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
} from "@/lib/status";
import { Badge, Button, Card, Input, Label, Select, SectionTitle, Textarea } from "@/components/ui";
import { ImageLightbox } from "@/components/image-lightbox";
import { ChevronRightIcon } from "@/components/icons";
import type { AppUser, Invoice, PaymentType, Project, Task } from "@/lib/types";

export default function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = use(params);
  const { user } = useAuth();
  const canManage = user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR";

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [priceInput, setPriceInput] = useState("");
  const [priceSubmitting, setPriceSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [paymentType, setPaymentType] = useState<PaymentType>("DP");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [clientOptions, setClientOptions] = useState<AppUser[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  function load() {
    api<Project>(`/projects/${id}`)
      .then((p) => {
        setProject(p);
        setPriceInput(p.totalPriceIdr !== null ? String(p.totalPriceIdr) : "");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
    void api<Task[]>(`/tasks?projectId=${id}`).then(setTasks);
    void api<Invoice[]>(`/projects/${id}/invoices`).then(setInvoices);
  }

  useEffect(load, [id]);

  useEffect(() => {
    if (!canManage) return;
    void api<AppUser[]>("/users").then((users) => setClientOptions(users.filter((u) => u.role === "CLIENT_APPROVER")));
  }, [canManage]);

  async function handleAssignClient(e: React.FormEvent) {
    e.preventDefault();
    setAssigning(true);
    setAssignError(null);
    try {
      await api(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ clientOwnerId: selectedClientId }),
      });
      load();
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Gagal menautkan klien.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleSetPrice(e: React.FormEvent) {
    e.preventDefault();
    setPriceSubmitting(true);
    setPriceError(null);
    try {
      await api(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ totalPriceIdr: Number(priceInput) }),
      });
      load();
    } catch (err) {
      setPriceError(err instanceof ApiError ? err.message : "Gagal menyimpan harga.");
    } finally {
      setPriceSubmitting(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    setPaymentSubmitting(true);
    setPaymentError(null);
    try {
      await api(`/projects/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          type: paymentType,
          amountIdr: Number(paymentAmount),
          method: paymentMethod,
          note: paymentNote || undefined,
        }),
      });
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentNote("");
      load();
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : "Gagal mencatat pembayaran.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function handleVerify(paymentId: string, decision: "VERIFIED" | "REJECTED", note?: string) {
    setVerifyingId(paymentId);
    setVerifyError(null);
    try {
      await api(`/projects/${id}/payments/${paymentId}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note }),
      });
      setRejectingId(null);
      setRejectNote("");
      load();
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : "Gagal memproses verifikasi.");
    } finally {
      setVerifyingId(null);
    }
  }

  if (notFound) {
    return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  }

  if (!project) {
    return <p className="text-sm text-ink-muted">Memuat…</p>;
  }

  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;
  const pendingPayments = project.payments.filter((p) => p.verificationStatus === "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/projects" className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
          <Badge>{PROJECT_STATUS_LABEL[project.status]}</Badge>
          <Badge tone={PAYMENT_STATUS_TONE[project.paymentStatus]}>
            {PAYMENT_STATUS_LABEL[project.paymentStatus]}
          </Badge>
        </div>
        {project.description && <p className="mt-1.5 text-sm text-ink-muted">{project.description}</p>}
      </div>

      {canManage && project.clientOwnerId === null && (
        <Card className="border-warning/40 bg-warning-bg/40">
          <SectionTitle>Proyek ini belum ditautkan ke akun klien</SectionTitle>
          <p className="mb-3 text-sm text-ink-muted">
            Klien tidak akan melihat proyek ini di portal mereka sampai ditautkan ke sebuah akun klien.
          </p>
          <form onSubmit={handleAssignClient} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Label>Akun klien</Label>
              <Select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} required>
                <option value="" disabled>
                  Pilih akun klien…
                </option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={assigning || selectedClientId === ""}>
              {assigning ? "Menautkan…" : "Tautkan Klien"}
            </Button>
          </form>
          {assignError && <p className="mt-2 text-sm text-danger">{assignError}</p>}
          {clientOptions.length === 0 && (
            <p className="mt-2 text-xs text-ink-muted">Belum ada akun klien terdaftar di organisasi ini.</p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Harga proyek</SectionTitle>
          <form onSubmit={handleSetPrice} className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Total harga (IDR)</Label>
              <Input
                type="number"
                min={0}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="10000000"
                disabled={!canManage}
              />
            </div>
            {canManage && (
              <Button type="submit" disabled={priceSubmitting}>
                {priceSubmitting ? "…" : "Simpan"}
              </Button>
            )}
          </form>
          {priceError && <p className="mt-2 text-sm text-danger">{priceError}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-ink-muted">Sudah dibayar (terverifikasi)</div>
              <div className="font-semibold text-ink">{formatIdr(project.totalPaidIdr)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Sisa</div>
              <div className="font-semibold text-ink">{remaining !== null ? formatIdr(remaining) : "—"}</div>
            </div>
            {project.minDpPercent !== null && (
              <div className="col-span-2">
                <div className="text-xs text-ink-muted">DP minimal (pemberitahuan invoice)</div>
                <div className="font-semibold text-ink">{project.minDpPercent}%</div>
              </div>
            )}
          </div>
        </Card>

        {canManage && (
          <Card>
            <SectionTitle>Catat pembayaran</SectionTitle>
            <form onSubmit={handleRecordPayment} className="flex flex-col gap-3">
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
              {paymentError && <p className="text-sm text-danger">{paymentError}</p>}
              <Button type="submit" disabled={paymentSubmitting || project.totalPriceIdr === null}>
                {paymentSubmitting ? "Menyimpan…" : "Catat Pembayaran"}
              </Button>
              {project.totalPriceIdr === null && (
                <p className="text-xs text-ink-muted">Tentukan harga proyek dulu sebelum mencatat pembayaran.</p>
              )}
            </form>
          </Card>
        )}
      </div>

      {canManage && pendingPayments.length > 0 && (
        <Card>
          <SectionTitle>Verifikasi pembayaran</SectionTitle>
          <div className="flex flex-col divide-y divide-border">
            {pendingPayments.map((pay) => (
              <div key={pay.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {pay.proofImageUrl && (
                      <ImageLightbox src={pay.proofImageUrl} alt={`Bukti pembayaran ${PAYMENT_TYPE_LABEL[pay.type]}`} />
                    )}
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {PAYMENT_TYPE_LABEL[pay.type]} · {pay.method} · {formatIdr(pay.amountIdr)}
                      </div>
                      <div className="text-xs text-ink-muted">
                        Diklaim {formatDate(pay.createdAt)}
                        {pay.note ? ` — ${pay.note}` : ""}
                      </div>
                    </div>
                  </div>
                  {rejectingId !== pay.id && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        onClick={() => handleVerify(pay.id, "VERIFIED")}
                        disabled={verifyingId === pay.id}
                      >
                        Setujui
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setRejectingId(pay.id);
                          setRejectNote("");
                        }}
                        disabled={verifyingId === pay.id}
                      >
                        Tolak
                      </Button>
                    </div>
                  )}
                </div>

                {rejectingId === pay.id && (
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <Label>Alasan penolakan (wajib diisi)</Label>
                    <Textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={2}
                      placeholder="Jumlah di bukti tidak sesuai dengan yang diklaim, misalnya"
                      autoFocus
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleVerify(pay.id, "REJECTED", rejectNote)}
                        disabled={verifyingId === pay.id || rejectNote.trim() === ""}
                      >
                        {verifyingId === pay.id ? "Menolak…" : "Kirim Penolakan"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setRejectingId(null)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {verifyError && <p className="mt-2 text-sm text-danger">{verifyError}</p>}
        </Card>
      )}

      <Card>
        <SectionTitle>Riwayat pembayaran</SectionTitle>
        {project.payments.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada pembayaran tercatat.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {project.payments.map((pay) => (
              <div key={pay.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  {pay.proofImageUrl && (
                    <ImageLightbox
                      src={pay.proofImageUrl}
                      alt={`Bukti pembayaran ${PAYMENT_TYPE_LABEL[pay.type]}`}
                      thumbnailClassName="h-10 w-10 rounded-md border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      {PAYMENT_TYPE_LABEL[pay.type]} · {pay.method}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatDate(pay.createdAt)}
                      {pay.note ? ` — ${pay.note}` : ""}
                    </div>
                    {pay.verificationStatus === "REJECTED" && pay.verificationNote && (
                      <div className="mt-0.5 text-xs text-danger">Alasan: {pay.verificationNote}</div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{formatIdr(pay.amountIdr)}</span>
                  <Badge tone={PAYMENT_VERIFICATION_TONE[pay.verificationStatus]}>
                    {PAYMENT_VERIFICATION_LABEL[pay.verificationStatus]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Riwayat invoice</SectionTitle>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada invoice terkirim.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium text-ink">{formatIdr(inv.amountIdr)}</div>
                  <div className="text-xs text-ink-muted">
                    {formatDate(inv.createdAt)}
                    {inv.minDpPercent !== null ? ` — DP minimal ${inv.minDpPercent}%` : ""}
                  </div>
                </div>
                <Badge tone={inv.emailSentAt ? "success" : "neutral"}>
                  {inv.emailSentAt ? "Email terkirim" : "Email belum terkirim"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Tugas</SectionTitle>
        {tasks.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada tugas untuk proyek ini.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                  <div className="text-xs text-ink-muted">
                    Revisi {t.revisionsUsed}/{t.maxRevisions}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                  <ChevronRightIcon width={16} height={16} className="text-ink-muted" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
