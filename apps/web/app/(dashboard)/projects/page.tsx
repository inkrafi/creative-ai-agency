"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PROJECT_STATUS_LABEL } from "@/lib/status";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const { user } = useAuth();
  const canCreate = user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR";

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<Project[]>("/projects").then(setProjects);
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined }),
      });
      setName("");
      setDescription("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat proyek.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-ink-muted">Pekerjaan</div>
          <h1 className="text-2xl font-bold text-ink">Proyek</h1>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm((v) => !v)}>
            <PlusIcon width={16} height={16} />
            Proyek Baru
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
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

      <Card className="p-0">
        {projects === null ? (
          <p className="p-5 text-sm text-ink-muted">Memuat…</p>
        ) : projects.length === 0 ? (
          <p className="p-5 text-sm text-ink-muted">Belum ada proyek. Buat proyek pertama Anda.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                  {p.description && <div className="truncate text-xs text-ink-muted">{p.description}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-ink-muted">
                    {formatIdr(p.totalPaidIdr)} / {p.totalPriceIdr !== null ? formatIdr(p.totalPriceIdr) : "—"}
                  </span>
                  <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>
                  <Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
