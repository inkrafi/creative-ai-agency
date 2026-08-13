"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PROJECT_STATUS_LABEL } from "@/lib/status";
import { Badge, Button, Card, Input, Label, SectionTitle, Textarea } from "@/components/ui";
import { SuccessDialog } from "@/components/success-dialog";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  function load() {
    void api<Project[]>("/projects").then(setProjects);
  }

  useEffect(load, []);

  const hasProjects = useMemo(() => (projects?.length ?? 0) > 0, [projects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined }),
      });
      setName("");
      setDescription("");
      setShowForm(false);
      setCreatedProjectId(created.id);
      setSuccessOpen(true);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat proyek.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Proyek</h1>
          <p className="mt-1 text-sm text-ink-muted">Semua proyek yang terhubung dengan akun Anda.</p>
        </div>
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          <PlusIcon width={16} height={16} />
          Proyek Baru
        </Button>
      </div>

      {showForm && (
        <Card>
          <SectionTitle>Buat proyek baru</SectionTitle>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <Label>Nama proyek</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Website Toko Kopi Senja" />
            </div>
            <div>
              <Label>Deskripsi (opsional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ringkasan singkat proyek ini"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Menyimpan…" : "Simpan"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Batal
              </Button>
            </div>
          </form>
        </Card>
      )}

      {projects === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : !hasProjects ? (
        <Card>
          <p className="text-sm text-ink-muted">Belum ada proyek. Buat proyek pertama Anda untuk mulai mengajukan brief.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="flex h-full flex-col justify-between gap-3 transition hover:border-brand hover:shadow-md">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-ink">{p.name}</div>
                    <ChevronRightIcon width={16} height={16} className="mt-0.5 shrink-0 text-ink-muted" />
                  </div>
                  {p.description && <div className="mt-1 line-clamp-2 text-xs text-ink-muted">{p.description}</div>}
                  {p.totalPriceIdr !== null && (
                    <div className="mt-2 text-xs tabular-nums text-ink-muted">
                      {formatIdr(p.totalPaidIdr)} / {formatIdr(p.totalPriceIdr)}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
                  <Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <SuccessDialog
        open={successOpen}
        title="Proyek berhasil dibuat!"
        message="Sekarang Anda bisa mengajukan brief untuk proyek ini kapan saja."
        actionLabel="Tutup"
        onClose={() => setSuccessOpen(false)}
        secondaryAction={createdProjectId ? { label: "Buka Proyek", href: `/projects/${createdProjectId}` } : undefined}
      />
    </div>
  );
}
