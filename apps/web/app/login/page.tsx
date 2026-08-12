"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@demo-agency.test");
  const [password, setPassword] = useState("password123");
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
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-4">
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-brand-ink shadow-sm shadow-brand/30">
            K
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ink">Kravio Studio</div>
            <div className="text-sm text-ink-muted">Masuk ke dashboard internal</div>
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
            <Label>Email</Label>
            <Input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@kravio.studio"
            />
          </div>

          <div>
            <Label>Kata sandi</Label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting} className="mt-1 w-full justify-center py-2.5">
            {submitting ? "Memproses…" : "Masuk"}
          </Button>

          <p className="text-center text-xs text-ink-muted">Akun demo dari seed script sudah terisi di atas.</p>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">Kravio Studio &middot; Dashboard internal</p>
      </div>
    </div>
  );
}
