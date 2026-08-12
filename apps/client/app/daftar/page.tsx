"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input, Label } from "@/components/ui";

export default function DaftarPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(evt: FormEvent) {
    evt.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await api<{ accessToken: string }>("/auth/client-signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      await login(accessToken);
      router.push("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-brand/[0.06] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-brand-ink shadow-sm shadow-brand/30">
            K
          </Link>
          <div className="text-center">
            <div className="text-lg font-semibold text-ink">Buat akun klien</div>
            <div className="text-sm text-ink-muted">Daftar untuk mulai mengajukan proyek</div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-7 shadow-xl shadow-ink/5"
        >
          {error && (
            <div className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div>
            <Label>Nama</Label>
            <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Anda" />
          </div>

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@perusahaan.com"
            />
          </div>

          <div>
            <Label>Kata sandi</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting} className="mt-1 w-full justify-center py-2.5">
            {submitting ? "Membuat akun…" : "Daftar"}
          </Button>

          <p className="text-center text-xs text-ink-muted">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Masuk di sini
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">Kravio Studio &middot; Portal klien</p>
      </div>
    </div>
  );
}
