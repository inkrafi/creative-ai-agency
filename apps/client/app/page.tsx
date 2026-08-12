"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Badge, Button } from "@/components/ui";
import { FolderIcon, WalletIcon } from "@/components/icons";

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
    <div className="bg-page">
      {/* Signature moment: a real brief turning into a priced project, not a
          stock hero image or gradient blob -- this is literally the product. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#123a63] via-[#0d2547] to-[#0a1526]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand/25 blur-3xl"
        />

        <header className="relative mx-auto flex max-w-4xl items-center justify-between px-4 py-6 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
              K
            </div>
            <div className="text-sm font-semibold text-white">Kravio Studio</div>
          </div>
          {isAuthenticated ? (
            <Link href="/home">
              <Button type="button" variant="accent">
                Buka Dashboard
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm font-medium text-white/75 transition hover:text-white">
                Masuk
              </Link>
              <Link href="/daftar">
                <Button type="button" variant="accent">
                  Daftar
                </Button>
              </Link>
            </div>
          )}
        </header>

        <main className="relative mx-auto max-w-4xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14 sm:pb-28">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
            Untuk pemilik usaha yang butuh website atau desain, tanpa ribet
          </span>

          <h1 className="mt-5 max-w-xl font-display text-4xl font-semibold text-balance text-white sm:text-5xl">
            Ceritakan proyeknya. Kami yang urus sisanya.
          </h1>
          <p className="mt-4 max-w-lg text-base text-white/70">
            Kravio Studio mengubah brief singkat Anda jadi proyek yang siap dikerjakan -- lengkap dengan estimasi
            harga, invoice, dan ruang untuk review hasil kerja.
          </p>

          {!isAuthenticated && (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/daftar">
                <Button type="button" variant="accent" className="justify-center px-5 py-2.5">
                  Daftar Sekarang
                </Button>
              </Link>
              <Link href="/login" className="text-sm font-medium text-white/85 hover:text-white">
                Sudah punya akun? Masuk
              </Link>
            </div>
          )}

          {/* The brief -> priced project transformation, rendered as two
              miniature versions of the portal's real Card/Badge language so
              the pitch and the product are visibly the same thing. */}
          <div className="mt-14 flex flex-col items-center gap-1 sm:flex-row sm:gap-0">
            <div className="w-full max-w-[240px] rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-medium text-white/60">
                <FolderIcon width={14} height={14} />
                Brief baru
              </div>
              <div className="mt-2 text-sm font-medium text-white">Website Kedai Kopi Senja</div>
              <Badge tone="brand">Website</Badge>
            </div>

            <div className="relative flex h-10 w-14 shrink-0 items-center justify-center sm:h-px sm:w-16">
              <div className="h-8 w-px bg-gradient-to-b from-transparent via-accent to-transparent sm:h-px sm:w-full sm:bg-gradient-to-r" />
              <span className="motion-safe:animate-pulse absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
            </div>

            <div className="w-full max-w-[240px] rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-medium text-white/60">
                <WalletIcon width={14} height={14} />
                Invoice terkirim
              </div>
              <div className="mt-2 text-sm font-medium text-white">Rp 4.500.000</div>
              <Badge tone="success">Menunggu pembayaran</Badge>
            </div>
          </div>
        </main>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-border bg-surface p-5">
              <div className="text-xs font-semibold text-brand">Langkah {i + 1}</div>
              <div className="mt-1.5 text-sm font-semibold text-ink">{step.title}</div>
              <p className="mt-1.5 text-sm text-ink-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="mx-auto max-w-4xl px-4 py-8 text-center text-xs text-ink-muted sm:px-6">
        Kravio Studio &middot; Portal klien
      </footer>
    </div>
  );
}
