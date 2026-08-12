"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input, Label } from "@/components/ui";
import { AuthPanel } from "@/components/auth-panel";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(evt: FormEvent) {
    evt.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await login(accessToken);
      router.push("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      eyebrow="Portal klien"
      title="Masuk ke akun Anda"
      blurb="Pantau brief, invoice, dan progres proyek Anda kapan saja."
    >
      <h2 className="text-lg font-semibold text-ink">Masuk</h2>
      <p className="mt-1 text-sm text-ink-muted">Gunakan email dan kata sandi akun Anda.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>
        )}

        <div>
          <Label>Email</Label>
          <Input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@perusahaan.com"
          />
        </div>

        <div>
          <Label>Kata sandi</Label>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <Button type="submit" disabled={submitting} className="mt-1 w-full justify-center py-2.5">
          {submitting ? "Memproses…" : "Masuk"}
        </Button>

        <p className="text-center text-xs text-ink-muted">
          Belum punya akun?{" "}
          <Link href="/daftar" className="font-medium text-brand hover:underline">
            Daftar di sini
          </Link>
          , atau hubungi tim Kravio yang menangani proyek Anda.
        </p>
      </form>
    </AuthPanel>
  );
}
