"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, Input, Label, Select, SectionTitle } from "@/components/ui";
import type { AppUser, Role } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  AGENCY_ADMIN: "Admin",
  AGENCY_EDITOR: "Editor",
  CLIENT_APPROVER: "Klien (Approver)",
  CLIENT_VIEWER: "Klien (Viewer)",
};

export default function ClientsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "AGENCY_ADMIN";

  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"CLIENT_APPROVER" | "CLIENT_VIEWER">("CLIENT_APPROVER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    void api<AppUser[]>("/users").then(setUsers);
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreated(null);
    try {
      const res = await api<AppUser & { temporaryPassword: string }>("/users", {
        method: "POST",
        body: JSON.stringify({ email, name, role }),
      });
      setCreated({ email: res.email, temporaryPassword: res.temporaryPassword });
      setEmail("");
      setName("");
      setCopied(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat akun.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!created) return;
    await navigator.clipboard.writeText(created.temporaryPassword);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs font-medium text-ink-muted">Tim</div>
        <h1 className="text-2xl font-bold text-ink">Akun Klien</h1>
      </div>

      {!isAdmin ? (
        <Card>
          <p className="text-sm text-ink-muted">Hanya admin yang bisa membuat akun login untuk klien.</p>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Buat akun klien baru</SectionTitle>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Nama</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Pemilik Kopi Senja" />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="klien@contoh.com"
                />
              </div>
              <div>
                <Label>Peran</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  <option value="CLIENT_APPROVER">Klien (Approver)</option>
                  <option value="CLIENT_VIEWER">Klien (Viewer)</option>
                </Select>
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={submitting} className="self-start">
              {submitting ? "Membuat…" : "Buat Akun"}
            </Button>
          </form>

          {created && (
            <div className="mt-4 rounded-lg border border-brand-light bg-brand-light p-4">
              <p className="text-sm font-medium text-ink">
                Akun untuk <span className="font-semibold">{created.email}</span> berhasil dibuat.
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Kata sandi sementara (hanya ditampilkan sekali, bagikan ke klien secara aman):
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink">
                  {created.temporaryPassword}
                </code>
                <Button type="button" variant="ghost" onClick={copyPassword}>
                  {copied ? "Tersalin" : "Salin"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-0">
        <div className="p-5 pb-0">
          <SectionTitle>Semua anggota</SectionTitle>
        </div>
        {users.length === 0 ? (
          <p className="p-5 pt-0 text-sm text-ink-muted">Memuat…</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{u.name}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {u.email} · Bergabung {formatDate(u.createdAt)}
                  </div>
                </div>
                <Badge>{ROLE_LABEL[u.role]}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
