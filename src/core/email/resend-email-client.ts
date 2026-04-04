import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/app-error";

export interface SendEmailInput {
  html: string;
  idempotencyKey?: string;
  subject: string;
  text: string;
  to: string;
}

export interface TransactionalEmailClient {
  isEnabled(): boolean;
  sendEmail(input: SendEmailInput): Promise<void>;
}

export class ResendEmailClient implements TransactionalEmailClient {
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(private readonly config: AppConfig) {
    this.apiKey = config.resendApiKey;
    this.from = config.resendFromName
      ? `${config.resendFromName} <${config.resendFromEmail}>`
      : config.resendFromEmail ?? "";
  }

  isEnabled() {
    return Boolean(this.apiKey && this.config.resendFromEmail);
  }

  async sendEmail(input: SendEmailInput) {
    if (!this.isEnabled()) {
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Transactional email is not configured.",
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: this.from,
        html: input.html,
        subject: input.subject,
        text: input.text,
        to: input.to,
      }),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {}),
      },
      method: "POST",
    });

    if (response.ok) {
      return;
    }

    let details: unknown = null;

    try {
      details = await response.json();
    } catch {
      details = await response.text();
    }

    throw new AppError(
      502,
      "EMAIL_DELIVERY_FAILED",
      "Failed to send verification email.",
      details,
    );
  }
}
