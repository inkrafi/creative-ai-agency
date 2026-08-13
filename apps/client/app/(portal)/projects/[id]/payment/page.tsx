"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PAYMENT_TYPE_LABEL } from "@/lib/status";
import { Badge, Button, Card, Input, Label, Select, SectionTitle, Textarea } from "@/components/ui";
import type { PaymentType, Project } from "@/lib/types";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PaymentPage({ params }: PageProps<"/projects/[id]/payment">) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
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
        body: JSON.stringify({
          type: paymentType,
          amountIdr: Number(paymentAmount),
          method: paymentMethod,
          note: paymentNote || undefined,
          proofImageBase64,
        }),
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/projects/${id}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">Bayar {project.name}</h1>
      </div>

      {project.totalPriceIdr === null ? (
        <Card>
          <p className="text-sm text-ink-muted">Harga proyek belum ditentukan. Menunggu invoice dari Kravio.</p>
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>Ringkasan</SectionTitle>
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
          </Card>

          <Card>
            <SectionTitle>Kirim bukti pembayaran</SectionTitle>
            <form onSubmit={handleClaim} className="flex flex-col gap-3">
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
                <p className="text-sm text-success">
                  Bukti pembayaran terkirim, menunggu verifikasi tim Kravio.{" "}
                  <Link href={`/projects/${id}`} className="font-medium text-brand hover:underline">
                    Kembali ke proyek
                  </Link>
                </p>
              )}
              <Button type="submit" disabled={claiming || !proofFile} className="self-start">
                {claiming ? "Mengirim…" : "Kirim Bukti Pembayaran"}
              </Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
