import { api } from "./api";
import { formatIdr } from "./format";
import type { Brief, Invoice, Project, Task } from "./types";

export interface ActivityItem {
  id: string;
  timestamp: string;
  projectId: string;
  projectName: string;
  message: string;
  tone: "neutral" | "success" | "warning" | "danger";
  href: string;
}

export const ACTIVITY_DOT_TONE: Record<ActivityItem["tone"], string> = {
  neutral: "bg-ink-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Fetches each project's briefs/invoices/tasks in parallel and flattens them into one recency-sorted feed. */
export async function buildActivity(projects: Project[], limit = 12): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  await Promise.all(
    projects.map(async (p) => {
      const [invoices, tasks, briefs] = await Promise.all([
        api<Invoice[]>(`/projects/${p.id}/invoices`),
        api<Task[]>(`/tasks?projectId=${p.id}`),
        api<Brief[]>(`/briefs?projectId=${p.id}`),
      ]);

      // Every client-created project has exactly one brief that created it
      // (see BriefsService.create()'s auto-project behavior) -- that brief's
      // own workspace page is where all of this project's activity lives
      // now that there's no standalone project page to link to.
      const briefHref = briefs[0] ? `/briefs/${briefs[0].id}` : "/briefs";

      for (const inv of invoices) {
        items.push({
          id: `invoice-${inv.id}`,
          timestamp: inv.createdAt,
          projectId: p.id,
          projectName: p.name,
          message: `Invoice terkirim — ${formatIdr(inv.amountIdr)}`,
          tone: "neutral",
          href: `/keuangan/invoice/${p.id}/${inv.id}`,
        });
      }

      for (const pay of p.payments) {
        if (pay.verificationStatus === "VERIFIED" && pay.verifiedAt) {
          items.push({
            id: `payment-verified-${pay.id}`,
            timestamp: pay.verifiedAt,
            projectId: p.id,
            projectName: p.name,
            message: `Pembayaran ${formatIdr(pay.amountIdr)} terverifikasi`,
            tone: "success",
            href: `/keuangan/pembayaran/${p.id}/${pay.id}`,
          });
        } else if (pay.verificationStatus === "REJECTED" && pay.verifiedAt) {
          items.push({
            id: `payment-rejected-${pay.id}`,
            timestamp: pay.verifiedAt,
            projectId: p.id,
            projectName: p.name,
            message: `Pembayaran ${formatIdr(pay.amountIdr)} ditolak${pay.verificationNote ? `: ${pay.verificationNote}` : ""}`,
            tone: "danger",
            href: `/keuangan/pembayaran/${p.id}/${pay.id}`,
          });
        }
      }

      for (const t of tasks) {
        if (t.status === "IN_REVIEW") {
          items.push({
            id: `task-review-${t.id}`,
            timestamp: t.updatedAt,
            projectId: p.id,
            projectName: p.name,
            message: `"${t.title}" siap untuk Anda review`,
            tone: "warning",
            href: briefHref,
          });
        }
        for (const r of t.revisionRequests) {
          if (r.billable === false && r.classifiedAt) {
            items.push({
              id: `revision-free-${r.id}`,
              timestamp: r.classifiedAt,
              projectId: p.id,
              projectName: p.name,
              message: `Revisi #${r.round} pada "${t.title}" ditandai gratis -- tidak memotong jatah revisi Anda`,
              tone: "success",
              href: briefHref,
            });
          }
        }
      }
    }),
  );

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items.slice(0, limit);
}
