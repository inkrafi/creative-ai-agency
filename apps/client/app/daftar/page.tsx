"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input, Label } from "@/components/ui";
import { AuthPanel } from "@/components/auth-panel";

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
    <AuthPanel
      eyebrow="Mulai proyek baru"
      title="Buat akun klien"
      blurb="Daftar sekali, lalu ajukan brief dan pantau semuanya dari satu tempat."
    >
      <h2 className="text-lg font-semibold text-ink">Daftar</h2>
      <p className="mt-1 text-sm text-ink-muted">Butuh kurang dari semenit.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>
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
    </AuthPanel>
  );
}
