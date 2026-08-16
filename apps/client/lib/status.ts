import type { Brief, PaymentStatus, PaymentVerificationStatus, ProjectStatus, TaskStatus } from "./types";

export type WorkStatusTone = "neutral" | "warning" | "brand" | "success";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Belum dikerjakan",
  IN_PROGRESS: "Diproses",
  IN_REVIEW: "Menunggu review klien",
  DONE: "Selesai",
};

export const TASK_STATUS_TONE: Record<TaskStatus, "neutral" | "warning" | "brand" | "success"> = {
  TODO: "neutral",
  IN_PROGRESS: "warning",
  IN_REVIEW: "brand",
  DONE: "success",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  NO_PRICE: "Belum ada harga",
  UNPAID: "Belum dibayar",
  PARTIAL: "DP terbayar",
  PAID: "Lunas",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, "neutral" | "warning" | "success"> = {
  NO_PRICE: "neutral",
  UNPAID: "warning",
  PARTIAL: "warning",
  PAID: "success",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "Aktif",
  ARCHIVED: "Diarsipkan",
};

export const PAYMENT_TYPE_LABEL = { DP: "DP", PELUNASAN: "Pelunasan", OTHER: "Lainnya" } as const;

export const PAYMENT_VERIFICATION_LABEL: Record<PaymentVerificationStatus, string> = {
  PENDING: "Menunggu verifikasi",
  VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak",
};

export const PAYMENT_VERIFICATION_TONE: Record<PaymentVerificationStatus, "neutral" | "warning" | "success" | "danger"> = {
  PENDING: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
};

/**
 * List-view counterpart to workStatus() below -- used on the Daftar Brief
 * page and Beranda's "Brief Terbaru" preview, where only the brief's own
 * GET /briefs payload (brief + a lightweight project.payments summary) is
 * available, not the full task list. Skips the "Selesai" (all tasks done)
 * distinction workStatus() makes on the brief's own workspace page -- a
 * verified payment is enough to call it "Sedang dikerjakan" here.
 */
export function briefListStatus(brief: Brief): { label: string; tone: WorkStatusTone } {
  const project = brief.project;
  if (!project || project.totalPriceIdr === null) return { label: "Menunggu harga dari tim Kravio", tone: "neutral" };
  const paymentStatus = derivePaymentStatus(project);
  if (paymentStatus === "PAID") return { label: "Selesai", tone: "success" };
  if (paymentStatus === "PARTIAL") return { label: "Sedang dikerjakan", tone: "brand" };
  return { label: "Menunggu pembayaran", tone: "warning" };
}

/**
 * Mirrors ProjectsService's paymentStatusFor()/sumVerified() on the
 * lightweight project summary GET /briefs carries (see BriefsService.
 * findAll()'s include) -- lets the Daftar Brief table show a payment
 * status distinct from the overall workflow status (briefListStatus)
 * without a second round-trip per row.
 */
export function derivePaymentStatus(project?: Brief["project"]): PaymentStatus {
  if (!project || project.totalPriceIdr === null) return "NO_PRICE";
  const paidIdr = project.payments
    .filter((p) => p.verificationStatus === "VERIFIED")
    .reduce((sum, p) => sum + p.amountIdr, 0);
  if (paidIdr <= 0) return "UNPAID";
  if (paidIdr < project.totalPriceIdr) return "PARTIAL";
  return "PAID";
}

/**
 * The richer status shown on a brief's own workspace page (once its
 * underlying project/tasks are loaded) -- a superset of briefListStatus()
 * that also uses actual task completion for "Selesai" while payment is
 * still only PARTIAL. "Sedang dikerjakan" kicks in the moment a payment is
 * verified (PARTIAL or PAID), independent of whether a task has formally
 * moved off TODO yet -- the client's money has been accepted, so from
 * their side the work is now underway.
 */
export function workStatus(params: {
  totalPriceIdr: number | null;
  paymentStatus: PaymentStatus;
  taskStatuses: TaskStatus[];
}): { label: string; tone: WorkStatusTone; description: string } {
  const { totalPriceIdr, paymentStatus, taskStatuses } = params;

  if (totalPriceIdr === null) {
    return {
      label: "Menunggu harga dari tim Kravio",
      tone: "neutral",
      description: "Tim Kravio sedang menyiapkan estimasi harga untuk brief ini.",
    };
  }
  if (paymentStatus === "UNPAID") {
    return {
      label: "Menunggu pembayaran",
      tone: "warning",
      description: "Anda belum melakukan pembayaran untuk brief ini.",
    };
  }
  if (paymentStatus === "PAID") {
    return {
      label: "Selesai",
      tone: "success",
      description: "Pembayaran sudah lunas. Terima kasih!",
    };
  }

  const hasTasks = taskStatuses.length > 0;
  if (hasTasks && taskStatuses.every((s) => s === "DONE")) {
    return { label: "Selesai", tone: "success", description: "Semua tugas untuk brief ini sudah selesai dikerjakan." };
  }

  return {
    label: "Sedang dikerjakan",
    tone: "brand",
    description: "Pembayaran sudah diterima -- tim Kravio sedang mengerjakan brief ini.",
  };
}

/** billable: null = staff hasn't reviewed yet, true = counted against your revision quota, false = free (Kravio's mistake). */
export function revisionClassificationLabel(billable: boolean | null): string {
  if (billable === null) return "Menunggu peninjauan tim Kravio";
  return billable ? "Dihitung sebagai jatah revisi" : "Gratis (kesalahan kami)";
}

export function revisionClassificationTone(billable: boolean | null): "neutral" | "warning" | "success" {
  if (billable === null) return "warning";
  return billable ? "neutral" : "success";
}
