import type { PaymentStatus, ProjectStatus, TaskStatus } from "./types";

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
