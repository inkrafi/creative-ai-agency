"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/status";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import type { Project } from "@/lib/types";

export default function PembayaranPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    void api<Project[]>("/projects").then(setProjects);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Pembayaran</h1>
        <p className="mt-1 text-sm text-ink-muted">Status pembayaran dan kirim bukti transfer untuk setiap proyek.</p>
      </div>

      {projects === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : projects.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">Belum ada proyek yang perlu dibayar.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {projects.map((p) => {
            const remaining = p.totalPriceIdr !== null ? Math.max(p.totalPriceIdr - p.totalPaidIdr, 0) : null;
            return (
              <Card key={p.id}>
                <SectionTitle
                  action={
                    p.totalPriceIdr !== null && (
                      <Link href={`/projects/${p.id}/payment`}>
                        <Button type="button">Bayar Sekarang</Button>
                      </Link>
                    )
                  }
                >
                  {p.name}
                </SectionTitle>
                {p.totalPriceIdr === null ? (
                  <p className="text-sm text-ink-muted">Harga proyek belum ditentukan. Menunggu invoice dari Kravio.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <div className="text-xs text-ink-muted">Total harga</div>
                        <div className="font-semibold tabular-nums text-ink">{formatIdr(p.totalPriceIdr)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-muted">Sudah dibayar</div>
                        <div className="font-semibold tabular-nums text-ink">{formatIdr(p.totalPaidIdr)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-muted">Sisa</div>
                        <div className="font-semibold tabular-nums text-ink">
                          {remaining !== null ? formatIdr(remaining) : "—"}
                        </div>
                      </div>
                    </div>
                    {p.minDpPercent !== null && (
                      <p className="mt-3 text-xs text-ink-muted">
                        DP minimal yang disarankan: {p.minDpPercent}% (
                        {formatIdr(Math.round((p.totalPriceIdr * p.minDpPercent) / 100))}). Ini hanya pemberitahuan,
                        bukan batas yang mengunci jumlah pembayaran Anda.
                      </p>
                    )}
                    <div className="mt-2">
                      <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
