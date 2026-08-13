"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatIdr } from "@/lib/format";
import { Badge, Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import type { Brief, Invoice } from "@/lib/types";

function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function BriefDetailPage({ params }: PageProps<"/briefs/[id]">) {
  const { id } = use(params);
  const { user } = useAuth();
  const canManage = user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR";

  const [brief, setBrief] = useState<Brief | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const [showClarifyForm, setShowClarifyForm] = useState(false);
  const [clarifyNote, setClarifyNote] = useState("");
  const [clarifySubmitting, setClarifySubmitting] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);

  const [amountIdr, setAmountIdr] = useState("");
  const [minDpPercent, setMinDpPercent] = useState("30");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function load() {
    api<Brief>(`/briefs/${id}`)
      .then((b) => {
        setBrief(b);
        if (b.aiSuggestedPriceIdr !== null) setAmountIdr(String(b.aiSuggestedPriceIdr));
        void api<Invoice[]>(`/projects/${b.projectId}/invoices`).then(setInvoices);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }

  useEffect(load, [id]);

  async function handleRequestClarification(e: React.FormEvent) {
    e.preventDefault();
    setClarifySubmitting(true);
    setClarifyError(null);
    try {
      await api(`/briefs/${id}/request-clarification`, {
        method: "PATCH",
        body: JSON.stringify({ note: clarifyNote }),
      });
      setClarifyNote("");
      setShowClarifyForm(false);
      load();
    } catch (err) {
      setClarifyError(err instanceof ApiError ? err.message : "Gagal mengirim permintaan klarifikasi.");
    } finally {
      setClarifySubmitting(false);
    }
  }

  async function handleSuggestPrice() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const suggestion = await api<{ priceIdr: number; reasoning: string }>(`/briefs/${id}/suggest-price`, {
        method: "POST",
      });
      setBrief((prev) => (prev ? { ...prev, aiSuggestedPriceIdr: suggestion.priceIdr, aiPriceReasoning: suggestion.reasoning } : prev));
      setAmountIdr(String(suggestion.priceIdr));
    } catch (err) {
      setSuggestError(err instanceof ApiError ? err.message : "Gagal meminta estimasi AI.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSendInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!brief) return;
    setSending(true);
    setSendError(null);
    setSent(false);
    try {
      const list = await api<Invoice[]>(`/projects/${brief.projectId}/invoices`, {
        method: "POST",
        body: JSON.stringify({
          amountIdr: Number(amountIdr),
          minDpPercent: minDpPercent ? Number(minDpPercent) : undefined,
          briefId: brief.id,
        }),
      });
      setInvoices(list);
      setSent(true);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Gagal mengirim invoice.");
    } finally {
      setSending(false);
    }
  }

  if (notFound) return <p className="text-sm text-ink-muted">Brief tidak ditemukan.</p>;
  if (!brief) return <p className="text-sm text-ink-muted">Memuat…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/projects/${brief.projectId}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink">{brief.title}</h1>
          <Badge>{brief.type === "WEBSITE" ? "Website" : "Desain"}</Badge>
        </div>
        <div className="mt-1 text-xs text-ink-muted">Diajukan {formatDate(brief.createdAt)}</div>
      </div>

      {brief.needsClarification ? (
        <Card className="border-warning/40 bg-warning-bg/40">
          <SectionTitle>Menunggu klarifikasi dari klien</SectionTitle>
          <p className="text-sm text-ink">{brief.clarificationNote}</p>
        </Card>
      ) : (
        brief.clarificationNote && (
          <Card>
            <SectionTitle>Klarifikasi terjawab</SectionTitle>
            <p className="text-sm text-ink-muted">Pertanyaan sebelumnya: {brief.clarificationNote}</p>
            {brief.clarificationRespondedAt && (
              <p className="mt-1 text-xs text-ink-muted">Dijawab {formatDate(brief.clarificationRespondedAt)}</p>
            )}
          </Card>
        )
      )}

      {canManage && !brief.needsClarification && (
        <Card>
          {!showClarifyForm ? (
            <Button type="button" variant="ghost" onClick={() => setShowClarifyForm(true)}>
              Minta Klarifikasi ke Klien
            </Button>
          ) : (
            <form onSubmit={handleRequestClarification} className="flex flex-col gap-3">
              <Label>Apa yang perlu diperjelas klien?</Label>
              <Textarea value={clarifyNote} onChange={(e) => setClarifyNote(e.target.value)} required rows={3} autoFocus />
              {clarifyError && <p className="text-sm text-danger">{clarifyError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={clarifySubmitting || clarifyNote.trim() === ""}>
                  {clarifySubmitting ? "Mengirim…" : "Kirim ke Klien"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowClarifyForm(false)}>
                  Batal
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

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
      </Card>

      {canManage && (
        <Card>
          <SectionTitle>Estimasi harga AI</SectionTitle>
          {brief.aiSuggestedPriceIdr !== null ? (
            <div className="mb-4 rounded-lg border border-border bg-surface-2 p-4">
              <div className="text-lg font-semibold tabular-nums text-ink">{formatIdr(brief.aiSuggestedPriceIdr)}</div>
              <p className="mt-1 text-sm text-ink-muted">{brief.aiPriceReasoning}</p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-ink-muted">Belum ada estimasi. Minta AI menilai berdasarkan brief ini.</p>
          )}
          <Button type="button" variant="ghost" onClick={handleSuggestPrice} disabled={suggesting}>
            {suggesting ? "Meminta estimasi…" : brief.aiSuggestedPriceIdr !== null ? "Minta Ulang Estimasi AI" : "Minta Estimasi AI"}
          </Button>
          {suggestError && <p className="mt-2 text-sm text-danger">{suggestError}</p>}
        </Card>
      )}

      {canManage && (
        <Card>
          <SectionTitle>Setujui & kirim invoice</SectionTitle>
          <form onSubmit={handleSendInvoice} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Harga proyek (IDR)</Label>
                <Input
                  type="number"
                  min={1}
                  value={amountIdr}
                  onChange={(e) => setAmountIdr(e.target.value)}
                  required
                  placeholder="10000000"
                />
              </div>
              <div>
                <Label>DP minimal (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={minDpPercent}
                  onChange={(e) => setMinDpPercent(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
            <p className="text-xs text-ink-muted">
              DP minimal hanya teks pemberitahuan di invoice -- tidak dipaksakan saat klien mencatat pembayaran.
            </p>
            {sendError && <p className="text-sm text-danger">{sendError}</p>}
            {sent && <p className="text-sm text-success">Invoice terkirim dan harga proyek diperbarui.</p>}
            <Button type="submit" disabled={sending} className="self-start">
              {sending ? "Mengirim…" : "Setujui & Kirim Invoice"}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle>Riwayat invoice</SectionTitle>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada invoice untuk proyek ini.</p>
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
    </div>
  );
}
