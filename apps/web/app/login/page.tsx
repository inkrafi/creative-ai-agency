"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-ink">
            K
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ink">Kravio Studio</div>
            <div className="text-sm text-ink-muted">Dashboard internal</div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? "Memproses…" : "Masuk"}
          </button>

          <p className="text-center text-xs text-ink-muted">Akun demo dari seed script sudah terisi di atas.</p>
        </form>
      </div>
    </div>
  );
}
