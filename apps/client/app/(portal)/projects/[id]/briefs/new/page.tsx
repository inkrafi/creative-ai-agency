"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { SuccessDialog } from "@/components/success-dialog";
import type { Brief, BriefType } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { WEBSITE: "Website", DESIGN: "Desain" };

export default function NewBriefPage({ params }: PageProps<"/projects/[id]/briefs/new">) {
  const { id } = use(params);
  const router = useRouter();

  const [type, setType] = useState<BriefType>("WEBSITE");
  const [title, setTitle] = useState("");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const context =
        type === "WEBSITE"
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

      await api<Brief>("/briefs", {
        method: "POST",
        body: JSON.stringify({ projectId: id, title, type, context }),
      });
      setSentOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim brief.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/projects/${id}`} className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Proyek
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink">Ajukan Brief Baru</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Ceritakan kebutuhan Anda -- tim Kravio akan meninjau dan menghubungi Anda dengan estimasi harga.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label>Jenis kebutuhan</Label>
            <div className="flex gap-2">
              {(["WEBSITE", "DESIGN"] as BriefType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    type === t
                      ? "border-brand bg-brand-light text-brand-dark"
                      : "border-border text-ink-muted hover:text-ink"
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Judul brief</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={type === "WEBSITE" ? "Website profil toko" : "Poster promosi Ramadan"}
            />
          </div>

          <SectionTitle>Detail</SectionTitle>

          {type === "WEBSITE" ? (
            <>
              <div>
                <Label>Bidang usaha</Label>
                <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} required placeholder="Kedai kopi lokal" />
              </div>
              <div>
                <Label>Target audiens</Label>
                <Input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  required
                  placeholder="Anak muda urban usia 20-30"
                />
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
                <Input value={pagesNeeded} onChange={(e) => setPagesNeeded(e.target.value)} placeholder="Beranda, Menu, Kontak" />
              </div>
              <div>
                <Label>Gaya/tone (opsional)</Label>
                <Input value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} placeholder="Hangat dan ramah" />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Jenis desain</Label>
                <Input value={designType} onChange={(e) => setDesignType(e.target.value)} required placeholder="Poster, logo, kemasan, ..." />
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
                <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="A3, 1080x1080px, ..." />
              </div>
              <div>
                <Label>Gaya/mood visual (opsional)</Label>
                <Input value={styleMood} onChange={(e) => setStyleMood(e.target.value)} placeholder="Minimalis, ceria, ..." />
              </div>
              <div>
                <Label>Teks wajib (opsional)</Label>
                <Textarea value={textToInclude} onChange={(e) => setTextToInclude(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={submitting} className="self-start">
            {submitting ? "Mengirim…" : "Kirim Brief"}
          </Button>
        </form>
      </Card>

      <SuccessDialog
        open={sentOpen}
        title="Brief berhasil dikirim!"
        message="Tim Kravio akan meninjau brief Anda dan memberikan estimasi harga secepatnya."
        actionLabel="Kembali ke Proyek"
        onClose={() => router.push(`/projects/${id}`)}
      />
    </div>
  );
}
