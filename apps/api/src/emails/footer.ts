import { env } from "../env.js";

/**
 * Per-recipient compliance rendering: the unsubscribe link, the physical postal
 * address, and the open pixel.
 *
 * Why this exists: the canonical YachtWay footer (see the yachtway-email-builder
 * brand skill) carries GoHighLevel merge tags — `{{email.unsubscribe_link}}` and
 * `{{location.address}}`. GHL fills those in. The CRM does not, so a template
 * lifted from GHL and sent through this API would render the braces literally and
 * ship mail with a dead unsubscribe link and no postal address. Both are
 * CAN-SPAM requirements for commercial mail, so marketing sends FAIL rather than
 * go out non-compliant.
 *
 * Deliberately not a templating engine. It resolves exactly the tags that carry
 * legal weight, plus the tracking pixel. Anything richer belongs in the campaign
 * builder.
 */

/** GHL-compatible tags, kept identical so templates move between GHL and the CRM. */
export const UNSUBSCRIBE_TAG = /\{\{\s*email\.unsubscribe_link\s*\}\}/g;
export const ADDRESS_TAG = /\{\{\s*location\.address\s*\}\}/g;

export class EmailComplianceError extends Error {
  constructor(public readonly missing: string) {
    super(`email_compliance_not_configured:${missing}`);
    this.name = "EmailComplianceError";
  }
}

function base(): string {
  // Trailing slashes would produce //e/u/... which some proxies normalise away
  // and others do not.
  return (env.PUBLIC_API_URL ?? "").replace(/\/+$/, "");
}

export function unsubscribeUrl(trackingToken: string): string {
  return `${base()}/e/u/${trackingToken}`;
}

export function openPixelUrl(trackingToken: string): string {
  return `${base()}/e/o/${trackingToken}`;
}

/** Does this html already carry its own opt-out, or must we append one? */
function hasOwnOptOut(html: string): boolean {
  UNSUBSCRIBE_TAG.lastIndex = 0;
  const tagged = UNSUBSCRIBE_TAG.test(html);
  UNSUBSCRIBE_TAG.lastIndex = 0;
  return tagged || /\/e\/u\//.test(html);
}

/** Does this html delegate the postal address to us via the GHL tag? */
function delegatesAddress(html: string): boolean {
  ADDRESS_TAG.lastIndex = 0;
  const found = ADDRESS_TAG.test(html);
  ADDRESS_TAG.lastIndex = 0;
  return found;
}

/**
 * Refuse a marketing send that cannot be made compliant. Called ONCE per send
 * before any recipient is dispatched, so the failure is a clean 503 with nothing
 * half-sent rather than a per-recipient error after rows exist.
 *
 * PUBLIC_API_URL is unconditional for marketing: the unsubscribe URL carries a
 * per-recipient token, so no template can hardcode it.
 *
 * COMPANY_POSTAL_ADDRESS is conditional, and deliberately so. YachtWay's address
 * is already baked into marketing templates (GHL resolves {{location.address}} on
 * its own sends), so a template arriving here may carry the address as literal
 * text — that is compliant and needs nothing from us. We only insist on the env
 * var when we would otherwise ship an address-shaped hole:
 *   • the html uses {{location.address}}, i.e. it is asking US to fill it in; or
 *   • the html has no opt-out, so we are appending the fallback footer and that
 *     footer needs an address of its own.
 * Anything else is the template's business, not ours.
 */
export function assertCanSend(input: { kind: string; html: string }): void {
  if (input.kind !== "marketing") return;
  if (!env.PUBLIC_API_URL) throw new EmailComplianceError("PUBLIC_API_URL");

  const needsAddress = delegatesAddress(input.html) || !hasOwnOptOut(input.html);
  if (needsAddress && !env.COMPANY_POSTAL_ADDRESS) {
    throw new EmailComplianceError("COMPANY_POSTAL_ADDRESS");
  }
}

/**
 * Minimal fallback footer, appended only when a marketing email contains no
 * unsubscribe link of its own. Follows the brand rules that apply to footers:
 * table layout, every colour inline, #7a7a7a legal text, the nested-span colour
 * lock so Apple Mail cannot recolour the link, and no purple anywhere.
 *
 * This is a legal backstop, not a design element. A real campaign should carry
 * the full canonical footer and simply keep the {{email.unsubscribe_link}} tag.
 */
function fallbackFooter(unsubUrl: string, address: string): string {
  return `
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;">
  <tr>
    <td align="center" style="padding:16px 20px 24px; font-family:Lato, Helvetica, Arial, sans-serif; font-size:10px; line-height:1.6; color:#7a7a7a;">
      You are receiving this email as a subscriber to YachtWay.com.<br>
      ${escapeHtml(address)}<br>
      &copy; YachtWay LLC. All rights reserved.
      <div style="margin-top:6px;">
        <a href="${escapeAttr(unsubUrl)}" target="_blank" style="color:#7a7a7a; text-decoration:underline;"><span style="color:#7a7a7a;">Unsubscribe</span></a>
      </div>
    </td>
  </tr>
</table>`.trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Render one recipient's copy: substitute the compliance tags, guarantee an
 * unsubscribe link on marketing mail, and append the open pixel.
 *
 * The pixel is added for every kind (it is how the CRM records opens without
 * depending on a provider's own tracking), but only when PUBLIC_API_URL is set —
 * a relative pixel URL in an email is useless.
 */
export function renderForRecipient(input: {
  html: string;
  trackingToken: string;
  kind: string;
}): string {
  const { html, trackingToken, kind } = input;
  const configured = Boolean(env.PUBLIC_API_URL);
  const unsubUrl = configured ? unsubscribeUrl(trackingToken) : "";
  const address = env.COMPANY_POSTAL_ADDRESS ?? "";

  const hadTag = UNSUBSCRIBE_TAG.test(html);
  // .test() on a /g regex advances lastIndex; reset before reusing it.
  UNSUBSCRIBE_TAG.lastIndex = 0;

  let out = html.replace(UNSUBSCRIBE_TAG, escapeAttr(unsubUrl)).replace(ADDRESS_TAG, escapeHtml(address));

  // Marketing mail must always carry an opt-out. assertCanSend has already
  // guaranteed the URL and address exist by this point.
  if (kind === "marketing" && !hadTag && !out.includes(`/e/u/${trackingToken}`)) {
    out += `\n${fallbackFooter(unsubUrl, address)}`;
  }

  if (configured) {
    out += `\n<img src="${escapeAttr(openPixelUrl(trackingToken))}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">`;
  }
  return out;
}

/**
 * RFC 8058 one-click unsubscribe headers. Gmail and Yahoo require these of bulk
 * senders, and they are what puts the native "Unsubscribe" affordance next to the
 * sender name. List-Unsubscribe-Post is what makes it one-click: the mailbox
 * provider POSTs the URL itself, which is why POST /e/u/:token exists alongside
 * the GET.
 *
 * Marketing only — these headers on transactional mail invite people to opt out
 * of things like receipts.
 */
export function complianceHeaders(input: {
  trackingToken: string;
  kind: string;
}): Record<string, string> {
  if (input.kind !== "marketing" || !env.PUBLIC_API_URL) return {};
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(input.trackingToken)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
