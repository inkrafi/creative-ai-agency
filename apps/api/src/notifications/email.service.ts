import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";

export interface InvoiceEmailParams {
  to: string;
  clientName: string;
  projectName: string;
  amountIdr: number;
  minDpPercent: number | null;
  portalUrl: string;
}

/**
 * Optional, like GeminiProvider's fallback -- RESEND_API_KEY is not set in
 * every environment (a fresh local checkout has no reason to have one yet),
 * so sendInvoiceEmail() no-ops with a warning log instead of throwing.
 * ProjectsService.sendInvoice() treats a failed/skipped send as best-effort:
 * the invoice itself still gets created and is visible in-portal either
 * way, matching the existing "side-channel failures don't mask the primary
 * action" pattern from BriefsService's credit-release cleanup.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client = this.isConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

  get isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  /** Returns whether the send actually succeeded -- callers persist this as Invoice.emailSentAt (or don't). */
  async sendInvoiceEmail(params: InvoiceEmailParams): Promise<boolean> {
    if (!this.client) {
      this.logger.warn("RESEND_API_KEY not set -- skipping invoice email, invoice still created.");
      return false;
    }

    const minDpLine =
      params.minDpPercent !== null
        ? `<p>DP minimal yang disarankan: <strong>${params.minDpPercent}%</strong> (Rp ${Math.round(
            (params.amountIdr * params.minDpPercent) / 100,
          ).toLocaleString("id-ID")}).</p>`
        : "";

    try {
      const { error } = await this.client.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: params.to,
        subject: `Invoice proyek ${params.projectName} -- Kravio Studio`,
        html: [
          `<p>Halo ${params.clientName},</p>`,
          `<p>Invoice untuk proyek <strong>${params.projectName}</strong> sebesar <strong>Rp ${params.amountIdr.toLocaleString(
            "id-ID",
          )}</strong> sudah tersedia.</p>`,
          minDpLine,
          `<p>Login ke portal Kravio untuk melihat detail dan mengunggah bukti pembayaran: <a href="${params.portalUrl}">${params.portalUrl}</a></p>`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      if (error) {
        this.logger.warn(`Resend returned an error sending invoice email: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Failed to send invoice email: ${String(err)}`);
      return false;
    }
  }
}
