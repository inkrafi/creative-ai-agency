"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatIdr } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, PROJECT_STATUS_LABEL } from "@/lib/status";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/data-table";
import { PlusIcon } from "@/components/icons";
import type { AppUser, Project } from "@/lib/types";

export default function ProjectsPage() {
  const { user } = useAuth();
  const canCreate = user?.role === "AGENCY_ADMIN" || user?.role === "AGENCY_EDITOR";

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void api<Project[]>("/projects").then(setProjects);
    void api<AppUser[]>("/users").then(setUsers);
  }

  useEffect(load, []);

  const clientNameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

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

  const columns: DataTableColumn<Project>[] = [
    {
      key: "name",
      header: "Proyek",
      render: (p) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{p.name}</div>
          {p.description && <div className="truncate text-xs text-ink-muted">{p.description}</div>}
        </div>
      ),
    },
    {
      key: "client",
      header: "Klien",
      render: (p) =>
        p.clientOwnerId ? (
          <span className="text-ink-muted">{clientNameById.get(p.clientOwnerId) ?? "—"}</span>
        ) : (
          <span className="text-ink-muted">Belum ditautkan</span>
        ),
    },
    {
      key: "paymentStatus",
      header: "Status Pembayaran",
      render: (p) => <Badge tone={PAYMENT_STATUS_TONE[p.paymentStatus]}>{PAYMENT_STATUS_LABEL[p.paymentStatus]}</Badge>,
    },
    {
      key: "paid",
      header: "Dibayar / Total",
      align: "right",
      render: (p) => (
        <span className="tabular-nums text-ink-muted">
          {formatIdr(p.totalPaidIdr)} / {p.totalPriceIdr !== null ? formatIdr(p.totalPriceIdr) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status Proyek",
      render: (p) => <Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>,
    },
  ];

  const filters: DataTableFilter<Project>[] = [
    {
      key: "paymentStatus",
      label: "Status Pembayaran",
      options: Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
      getValue: (p) => p.paymentStatus,
    },
    {
      key: "status",
      label: "Status Proyek",
      options: Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
      getValue: (p) => p.status,
    },
  ];

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

      {projects === null ? (
        <p className="text-sm text-ink-muted">Memuat…</p>
      ) : (
        <DataTable
          data={projects}
          columns={columns}
          rowKey={(p) => p.id}
          getRowHref={(p) => `/projects/${p.id}`}
          searchPlaceholder="Cari nama proyek…"
          searchValue={(p) => `${p.name} ${p.description ?? ""}`}
          filters={filters}
          emptyMessage="Belum ada proyek. Buat proyek pertama Anda."
        />
      )}
    </div>
  );
}
