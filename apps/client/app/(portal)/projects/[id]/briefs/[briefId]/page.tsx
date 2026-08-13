"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Badge, Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { SuccessDialog } from "@/components/success-dialog";
import type { Brief, BriefType } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { WEBSITE: "Website", DESIGN: "Desain" };

function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function ClientBriefDetailPage({ params }: PageProps<"/projects/[id]/briefs/[briefId]">) {
  const { id, briefId } = use(params);
  const router = useRouter();

  const [brief, setBrief] = useState<Brief | null>(null);
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentOpen, setSentOpen] = useState(false);

  function load() {
    api<Brief>(`/briefs/${briefId}`)
      .then((b) => {
        setBrief(b);
        const c = b.context as Record<string, string | undefined>;
        if (b.type === "WEBSITE") {
          setBusinessType(c.businessType ?? "");
          setTargetAudience(c.targetAudience ?? "");
          setPainPoints(c.painPoints ?? "");
          setGoals(c.goals ?? "");
          setPagesNeeded(c.pagesNeeded ?? "");
          setToneStyle(c.toneStyle ?? "");
        } else {
          setDesignType(c.designType ?? "");
          setPurpose(c.purpose ?? "");
          setKeyMessage(c.keyMessage ?? "");
          setDimensions(c.dimensions ?? "");
          setStyleMood(c.styleMood ?? "");
          setTextToInclude(c.textToInclude ?? "");
        }
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
        brief.type === "WEBSITE"
          ? {
              businessType,
              targetAudience,
              painPoints,
              goals,
              pagesNeeded: pagesNeeded || undefined,
              toneStyle: toneStyle || undefined,
            }
          : {
              designType,
              purpose,
              keyMessage,
              dimensions: dimensions || undefined,
              styleMood: styleMood || undefined,
              textToInclude: textToInclude || undefined,
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
  if (!brief) return <p className="text-sm text-ink-muted">Memuat…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/projects/${id}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink">{brief.title}</h1>
          <Badge>{TYPE_LABEL[brief.type]}</Badge>
        </div>
      </div>

      {brief.needsClarification ? (
        <>
          <Card className="border-warning/40 bg-warning-bg/40">
            <SectionTitle>Tim Kravio butuh info tambahan</SectionTitle>
            <p className="text-sm text-ink">{brief.clarificationNote}</p>
          </Card>

          <Card>
            <SectionTitle>Perbarui brief Anda</SectionTitle>
            <form onSubmit={handleRespond} className="flex flex-col gap-4">
              {brief.type === "WEBSITE" ? (
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
                    <Label>Tujuan website</Label>
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
              ) : (
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
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={submitting} className="self-start">
                {submitting ? "Mengirim…" : "Kirim Jawaban"}
              </Button>
            </form>
          </Card>
        </>
      ) : (
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

      <SuccessDialog
        open={sentOpen}
        title="Jawaban terkirim!"
        message="Tim Kravio akan meninjau ulang brief Anda."
        actionLabel="Kembali ke Proyek"
        onClose={() => router.push(`/projects/${id}`)}
      />
    </div>
  );
}
