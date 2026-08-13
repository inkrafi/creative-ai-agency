"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, initials } from "@/lib/format";
import { Button, Card, Input, Label, SectionTitle } from "@/components/ui";
import { SuccessDialog } from "@/components/success-dialog";
import { LockIcon, UserIcon } from "@/components/icons";
import type { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const { profile, organization, refreshProfile } = useAuth();

  // profile is already hydrated by the time this page can render -- the
  // portal layout gates children behind status === "authenticated", which
  // only flips true after AuthProvider's hydrate() has fetched it. Lazy
  // init (not a sync-from-prop effect) is correct here since there's no
  // later point where profile changes out from under an already-mounted page.
  const [name, setName] = useState(() => profile?.name ?? "");

  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccessOpen, setNameSuccessOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccessOpen, setPasswordSuccessOpen] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameError(null);
    try {
      await api<UserProfile>("/users/me", { method: "PATCH", body: JSON.stringify({ name }) });
      await refreshProfile();
      setNameSuccessOpen(true);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : "Gagal menyimpan nama.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await api("/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccessOpen(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Gagal mengubah kata sandi.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (!profile) return <p className="text-sm text-ink-muted">Memuat…</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Profil Saya</h1>
        <p className="mt-1 text-sm text-ink-muted">Kelola informasi akun dan keamanan login Anda.</p>
      </div>

      <Card className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-bold text-white">
          {initials(profile.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-ink">{profile.name}</div>
          <div className="truncate text-sm text-ink-muted">{profile.email}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {organization?.name ?? "—"} · Bergabung {formatDate(profile.createdAt)}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <UserIcon width={16} height={16} className="text-brand" />
            Ubah nama
          </span>
        </SectionTitle>
        <form onSubmit={handleSaveName} className="flex flex-col gap-4">
          <div>
            <Label>Nama lengkap</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          {nameError && <p className="text-sm text-danger">{nameError}</p>}
          <Button type="submit" disabled={savingName || name.trim() === profile.name} className="self-start">
            {savingName ? "Menyimpan…" : "Simpan Nama"}
          </Button>
        </form>
      </Card>

      <Card>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <LockIcon width={16} height={16} className="text-brand" />
            Ubah kata sandi
          </span>
        </SectionTitle>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <Label>Kata sandi saat ini</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Kata sandi baru</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <Label>Konfirmasi kata sandi baru</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
          <Button type="submit" disabled={savingPassword} className="self-start">
            {savingPassword ? "Menyimpan…" : "Ubah Kata Sandi"}
          </Button>
        </form>
      </Card>

      <SuccessDialog
        open={nameSuccessOpen}
        title="Nama berhasil diperbarui!"
        message="Perubahan sudah tersimpan."
        onClose={() => setNameSuccessOpen(false)}
      />
      <SuccessDialog
        open={passwordSuccessOpen}
        title="Kata sandi berhasil diubah!"
        message="Gunakan kata sandi baru Anda saat login berikutnya."
        onClose={() => setPasswordSuccessOpen(false)}
      />
    </div>
  );
}
