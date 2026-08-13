"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { SuccessDialog } from "@/components/success-dialog";
import type { Brief, BriefType } from "@/lib/types";

const TYPE_LABEL: Record<BriefType, string> = { LANDING_PAGE: "Landing Page", DESIGN: "Desain", VIDEO: "Video" };

export default function NewBriefPage() {
  const router = useRouter();

  const [type, setType] = useState<BriefType>("LANDING_PAGE");
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

  const [videoType, setVideoType] = useState("");
  const [videoPurpose, setVideoPurpose] = useState("");
  const [duration, setDuration] = useState("");
  const [videoKeyMessage, setVideoKeyMessage] = useState("");
  const [videoStyleMood, setVideoStyleMood] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentOpen, setSentOpen] = useState(false);
  const [createdBriefId, setCreatedBriefId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const context =
        type === "LANDING_PAGE"
          ? {
              businessType,
              targetAudience,
              painPoints,
              goals,
              pagesNeeded: pagesNeeded || undefined,
              toneStyle: toneStyle || undefined,
            }
          : type === "DESIGN"
            ? {
                designType,
                purpose,
                keyMessage,
                dimensions: dimensions || undefined,
                styleMood: styleMood || undefined,
                textToInclude: textToInclude || undefined,
              }
            : {
                videoType,
                purpose: videoPurpose,
                duration,
                keyMessage: videoKeyMessage,
                styleMood: videoStyleMood || undefined,
                referenceLinks: referenceLinks || undefined,
              };

      // No projectId -- a workspace (Project, behind the scenes) is
      // created automatically for this brief; the client never picks or
      // names one directly.
      const created = await api<Brief>("/briefs", {
        method: "POST",
        body: JSON.stringify({ title, type, context }),
      });
      setCreatedBriefId(created.id);
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
        <Link href="/briefs" className="text-xs font-medium text-ink-muted hover:text-ink">
          ← Brief
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
              {(["LANDING_PAGE", "DESIGN", "VIDEO"] as BriefType[]).map((t) => (
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
              placeholder={type === "LANDING_PAGE" ? "Landing page profil toko" : type === "DESIGN" ? "Poster promosi Ramadan" : "Video promosi menu baru"}
            />
          </div>

          <SectionTitle>Detail</SectionTitle>

          {type === "LANDING_PAGE" ? (
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
                <Label>Tujuan landing page</Label>
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
          ) : type === "DESIGN" ? (
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
          ) : (
            <>
              <div>
                <Label>Jenis video</Label>
                <Input value={videoType} onChange={(e) => setVideoType(e.target.value)} required placeholder="Video promosi produk, reels, iklan, ..." />
              </div>
              <div>
                <Label>Tujuan</Label>
                <Textarea value={videoPurpose} onChange={(e) => setVideoPurpose(e.target.value)} required rows={2} />
              </div>
              <div>
                <Label>Durasi</Label>
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} required placeholder="30 detik" />
              </div>
              <div>
                <Label>Pesan utama</Label>
                <Textarea value={videoKeyMessage} onChange={(e) => setVideoKeyMessage(e.target.value)} required rows={2} />
              </div>
              <div>
                <Label>Gaya/mood visual (opsional)</Label>
                <Input value={videoStyleMood} onChange={(e) => setVideoStyleMood(e.target.value)} placeholder="Ceria, cepat, energik, ..." />
              </div>
              <div>
                <Label>Referensi (opsional)</Label>
                <Textarea value={referenceLinks} onChange={(e) => setReferenceLinks(e.target.value)} rows={2} placeholder="Link video referensi" />
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
        actionLabel="Lihat Brief"
        onClose={() => router.push(createdBriefId ? `/briefs/${createdBriefId}` : "/briefs")}
      />
    </div>
  );
}
