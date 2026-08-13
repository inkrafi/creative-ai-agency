import type { PaymentStatus, PaymentVerificationStatus, ProjectStatus, TaskStatus } from "./types";

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

export function briefStatus(needsClarification: boolean): { label: string; tone: "neutral" | "warning" } {
  if (needsClarification) return { label: "Butuh info tambahan dari Anda", tone: "warning" };
  return { label: "Terkirim -- menunggu tim Kravio", tone: "neutral" };
}

/**
 * The richer status shown on a brief's own workspace page (once its
 * underlying project/tasks are loaded) -- a superset of briefStatus()
 * that also reflects payment + work progress. "Sedang dikerjakan" kicks
 * in the moment a payment is verified (PARTIAL or PAID), independent of
 * whether a task has formally moved off TODO yet -- the client's money
 * has been accepted, so from their side the work is now underway.
 */
export function workStatus(params: {
  needsClarification: boolean;
  totalPriceIdr: number | null;
  paymentStatus: PaymentStatus;
  taskStatuses: TaskStatus[];
}): { label: string; tone: WorkStatusTone } {
  const { needsClarification, totalPriceIdr, paymentStatus, taskStatuses } = params;

  if (needsClarification) return { label: "Butuh info tambahan dari Anda", tone: "warning" };
  if (totalPriceIdr === null) return { label: "Menunggu harga dari tim Kravio", tone: "neutral" };
  if (paymentStatus === "UNPAID") return { label: "Menunggu pembayaran", tone: "warning" };

  const hasTasks = taskStatuses.length > 0;
  if (hasTasks && taskStatuses.every((s) => s === "DONE")) return { label: "Selesai", tone: "success" };

  return { label: "Sedang dikerjakan", tone: "brand" };
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
