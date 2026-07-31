import { type EmailKind, type EmailProvider, resolveProvider } from "@yachtway/shared";
import { env } from "../env.js";
import { mailgunSendConfigured, sendMailgunMessage } from "./mailgun.js";

/**
 * Provider routing for outbound email.
 *
 * The CLASS of the email picks the transport, not the sender's preference:
 *   system        → AWS SES   (password resets, alerts, receipts)
 *   transactional → Gmail     (1:1 rep ↔ contact, sent as the rep's mailbox)
 *   marketing     → Mailgun   (bulk, with open/click tracking)
 *
 * Mailgun is fully wired. SES and Gmail are not yet: each reports
 * `configured() === false` and throws ProviderNotConfiguredError, which the
 * route surfaces as 503 rather than pretending a send happened. That mirrors the
 * Amplitude receiver's closed default — a missing integration must fail loudly,
 * never silently drop mail.
 */

export class ProviderNotConfiguredError extends Error {
  constructor(public readonly provider: EmailProvider) {
    super(`email_provider_not_configured:${provider}`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderNotAllowedError extends Error {
  constructor(kind: EmailKind, provider: EmailProvider) {
    super(`provider_not_allowed_for_kind:${kind}:${provider}`);
    this.name = "ProviderNotAllowedError";
  }
}

export interface DispatchInput {
  to: string;
  toName?: string | null;
  from: string;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  /** Opaque per-recipient id echoed back by delivery webhooks. */
  trackingToken: string;
}

export interface DispatchResult {
  /** Provider's message id, stored so webhooks can find the recipient row. */
  providerMessageId: string | null;
}

/** SES — verified domain + DKIM/SPF/DMARC and IAM credentials still pending. */
export function sesConfigured(): boolean {
  return Boolean(env.SES_REGION && env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY);
}

/** Gmail — needs Workspace domain-wide delegation so reps send as themselves. */
export function gmailConfigured(): boolean {
  return Boolean(env.GMAIL_SERVICE_ACCOUNT_EMAIL && env.GMAIL_PRIVATE_KEY);
}

export function providerConfigured(provider: EmailProvider): boolean {
  switch (provider) {
    case "mailgun":
      return mailgunSendConfigured();
    case "ses":
      return sesConfigured();
    case "gmail":
      return gmailConfigured();
    default:
      return false;
  }
}

/**
 * Resolve kind → provider (honouring an allowed override) and confirm it can
 * actually send. Throws before any recipient row is touched.
 */
export function planTransport(
  kind: EmailKind,
  requested?: EmailProvider | null,
): { provider: EmailProvider; overridden: boolean } {
  let plan: { provider: EmailProvider; overridden: boolean };
  try {
    plan = resolveProvider(kind, requested ?? null);
  } catch {
    throw new ProviderNotAllowedError(kind, requested as EmailProvider);
  }
  if (!providerConfigured(plan.provider)) throw new ProviderNotConfiguredError(plan.provider);
  return plan;
}

/** Send one message through the resolved provider. */
export async function dispatch(
  provider: EmailProvider,
  input: DispatchInput,
): Promise<DispatchResult> {
  switch (provider) {
    case "mailgun": {
      // crmMessageId round-trips on every Mailgun event as a custom variable,
      // so we pass the per-recipient tracking token: delivery/open/click
      // webhooks then resolve straight back to one email_recipients row.
      const res = await sendMailgunMessage({
        to: input.to,
        from: input.fromName ? `${input.fromName} <${input.from}>` : input.from,
        subject: input.subject,
        html: input.html,
        crmMessageId: input.trackingToken,
      });
      return { providerMessageId: res.providerMessageId };
    }
    case "ses":
    case "gmail":
      // Deliberately unimplemented rather than faked. See INTEGRATIONS.md for
      // what each needs (SES: verified domain + IAM; Gmail: Workspace DWD).
      throw new ProviderNotConfiguredError(provider);
    default:
      throw new ProviderNotConfiguredError(provider);
  }
}
