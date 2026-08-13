"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatIdr } from "@/lib/format";
import { PAYMENT_TYPE_LABEL, PAYMENT_VERIFICATION_LABEL, PAYMENT_VERIFICATION_TONE } from "@/lib/status";
import { Badge, Card, SectionTitle } from "@/components/ui";
import type { Payment, Project } from "@/lib/types";

export default function PaymentDetailPage({ params }: PageProps<"/riwayat/pembayaran/[projectId]/[paymentId]">) {
  const { projectId, paymentId } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api<Project>(`/projects/${projectId}`)
      .then(setProject)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [projectId]);

  if (notFound) return <p className="text-sm text-ink-muted">Proyek tidak ditemukan.</p>;
  if (!project) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const payment: Payment | undefined = project.payments.find((p) => p.id === paymentId);
  if (!payment) return <p className="text-sm text-ink-muted">Pembayaran tidak ditemukan.</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/riwayat" className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Riwayat
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">Detail Pembayaran</h1>
        <p className="mt-1 text-sm text-ink-muted">{project.name}</p>
      </div>

      <Card>
        <SectionTitle action={<Badge tone={PAYMENT_VERIFICATION_TONE[payment.verificationStatus]}>{PAYMENT_VERIFICATION_LABEL[payment.verificationStatus]}</Badge>}>
          {PAYMENT_TYPE_LABEL[payment.type]} · {payment.method}
        </SectionTitle>

        <div className="text-3xl font-semibold tabular-nums text-ink">{formatIdr(payment.amountIdr)}</div>
        <div className="mt-1 text-xs text-ink-muted">Dikirim {formatDate(payment.createdAt)}</div>

        {payment.note && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-xs font-medium text-ink-muted">Catatan Anda</div>
            <p className="mt-1 text-sm text-ink">{payment.note}</p>
          </div>
        )}

        {payment.verificationStatus === "REJECTED" && payment.verificationNote && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger-bg p-3">
            <div className="text-xs font-medium text-danger">Alasan ditolak</div>
            <p className="mt-1 text-sm text-danger">{payment.verificationNote}</p>
          </div>
        )}

        {payment.verificationStatus === "VERIFIED" && payment.verifiedAt && (
          <p className="mt-4 text-xs text-ink-muted">Diverifikasi {formatDate(payment.verifiedAt)}</p>
        )}

        {payment.proofImageUrl && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-xs font-medium text-ink-muted">Bukti transfer</div>
            {/* Base64 data URL from the claim form -- an <img> renders it directly, no external request. */}
            <img
              src={payment.proofImageUrl}
              alt="Bukti transfer"
              className="w-full rounded-lg border border-border object-contain"
            />
          </div>
        )}
      </Card>
    </div>
  );
}
