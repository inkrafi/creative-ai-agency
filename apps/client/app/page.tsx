"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";

const STEPS = [
  {
    title: "Daftar & ajukan brief",
    body: "Buat akun, buat proyek, dan ceritakan kebutuhan Anda -- website atau desain -- lewat form brief singkat.",
  },
  {
    title: "Kami kirim estimasi & invoice",
    body: "Tim Kravio meninjau brief Anda, menentukan harga, dan mengirim invoice langsung ke portal ini.",
  },
  {
    title: "Bayar, review, selesai",
    body: "Catat pembayaran dengan bukti transfer, review hasil kerja, dan minta revisi -- semua dari satu tempat.",
  },
];

export default function LandingPage() {
  const { status } = useAuth();
  const isAuthenticated = status === "authenticated";

  return (
    <div className="relative overflow-hidden bg-page">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-brand/[0.06] blur-3xl"
      />

      <header className="relative mx-auto flex max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            K
          </div>
          <div className="text-sm font-semibold text-ink">Kravio Studio</div>
        </div>
        {isAuthenticated ? (
          <Link href="/home">
            <Button type="button">Buka Dashboard</Button>
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-medium text-ink-muted hover:text-ink">
              Masuk
            </Link>
            <Link href="/daftar">
              <Button type="button">Daftar</Button>
            </Link>
          </div>
        )}
      </header>

      <main className="relative mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="max-w-xl">
          <h1 className="text-3xl font-bold text-balance text-ink sm:text-4xl">
            Satu tempat untuk brief, invoice, pembayaran, dan review pekerjaan Anda.
          </h1>
          <p className="mt-4 text-base text-ink-muted">
            Portal klien Kravio Studio: ajukan proyek website atau desain, pantau harga dan pembayaran, dan
            setujui hasil kerja tim kami -- tanpa bolak-balik chat.
          </p>
          {!isAuthenticated && (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/daftar">
                <Button type="button" className="justify-center px-5 py-2.5">
                  Daftar Sekarang
                </Button>
              </Link>
              <Link href="/login" className="text-sm font-medium text-ink hover:text-brand">
                Sudah punya akun? Masuk
              </Link>
            </div>
          )}
        </div>

        <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-border bg-surface p-5">
              <div className="text-xs font-semibold text-brand">Langkah {i + 1}</div>
              <div className="mt-1.5 text-sm font-semibold text-ink">{step.title}</div>
              <p className="mt-1.5 text-sm text-ink-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative mx-auto max-w-3xl px-4 py-8 text-center text-xs text-ink-muted sm:px-6">
        Kravio Studio &middot; Portal klien
      </footer>
    </div>
  );
}
