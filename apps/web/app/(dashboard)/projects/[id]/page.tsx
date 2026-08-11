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
  PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
} from "@/lib/status";
import { Badge, Button, Card, Input, Label, Select, SectionTitle, Textarea } from "@/components/ui";
import type { PaymentType, Project, Task } from "@/lib/types";

export default function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = use(params);
  const { user } = useAuth();
  const canManage = user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR";

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
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
  }

  useEffect(load, [id]);

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

  if (notFound) {
    return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  }

  if (!project) {
    return <p className="text-sm text-ink-muted">Memuat…</p>;
  }

  const remaining = project.totalPriceIdr !== null ? Math.max(project.totalPriceIdr - project.totalPaidIdr, 0) : null;

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
              <div className="text-xs text-ink-muted">Sudah dibayar</div>
              <div className="font-semibold text-ink">{formatIdr(project.totalPaidIdr)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Sisa</div>
              <div className="font-semibold text-ink">{remaining !== null ? formatIdr(remaining) : "—"}</div>
            </div>
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

      <Card>
        <SectionTitle>Riwayat pembayaran</SectionTitle>
        {project.payments.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada pembayaran tercatat.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {project.payments.map((pay) => (
              <div key={pay.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {PAYMENT_TYPE_LABEL[pay.type]} · {pay.method}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {formatDate(pay.createdAt)}
                    {pay.note ? ` — ${pay.note}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-ink">{formatIdr(pay.amountIdr)}</div>
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
              <div key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                  <div className="text-xs text-ink-muted">
                    Revisi {t.revisionsUsed}/{t.maxRevisions}
                  </div>
                </div>
                <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
