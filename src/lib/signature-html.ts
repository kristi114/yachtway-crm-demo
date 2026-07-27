/**
 * Rich (HTML) email signature rendering.
 *
 * Mirrors the YachtWay signature-generator markup: a table based layout with
 * inline styles only, so the markup survives a copy/paste into Gmail, Outlook
 * or Apple Mail with the photo, logo and product links intact.
 */

export interface SignatureProfile {
  name: string;
  position: string;
  /** Headshot / avatar URL. */
  image: string;
  website: string;
  email: string;
  phone?: string;
  /** Tel: value without formatting, derived when omitted. */
  phoneOpen?: string;
  /** Column width used by the name/position block (matches the generator). */
  width?: string;
}

export interface SignatureLink {
  label: string;
  url: string;
  /** Small mono icon shown before the label (24x24 png). */
  icon?: string;
}

import { SIGNATURE_LOGO } from "@/lib/signature-assets";

/** Official signature icon set (assets.yachtway.com/email-icons). */
const ICON = "https://assets.yachtway.com/email-icons/";

export const SIGNATURE_ASSETS = {
  logo: SIGNATURE_LOGO,
  imageBase: "https://assets.yachtway.com/email-signatures/",
  globe: `${ICON}web_outline.svg`,
  mail: `${ICON}mail_outline.svg`,
  phone: `${ICON}phone_outline.svg`,
  instagram: `${ICON}instagram_logo_solid.svg`,
  youtube: `${ICON}youtube_logo_solid.svg`,
  linkedin: `${ICON}linkedin_logo_solid.svg`,
  facebook: `${ICON}facebook_solid.svg`,
  mastercover: `${ICON}shield_outline.svg`,
  financing: `${ICON}get_pre_qualified_outline.svg`,
  easysign: `${ICON}easysign_outline.svg`,
  studio: `${ICON}photo_camera_outline.svg`,
};

/** Webfonts used by the signature markup (Gmail keeps the <link> in the doc). */
export const SIGNATURE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Poppins:wght@400;500&display=swap";

export const SIGNATURE_SOCIALS: SignatureLink[] = [
  { label: "Instagram", url: "https://www.instagram.com/yachtway", icon: SIGNATURE_ASSETS.instagram },
  { label: "YouTube", url: "https://www.youtube.com/@yachtway", icon: SIGNATURE_ASSETS.youtube },
  { label: "LinkedIn", url: "https://www.linkedin.com/company/yachtway", icon: SIGNATURE_ASSETS.linkedin },
  { label: "Facebook", url: "https://www.facebook.com/102194509425863", icon: SIGNATURE_ASSETS.facebook },
];

export const DEFAULT_SIGNATURE_LINKS: SignatureLink[] = [
  { label: "MasterCover", url: "https://yachtway.com/boat-insurance/", icon: SIGNATURE_ASSETS.mastercover },
  { label: "Apply for Financing", url: "https://yachtway.com/easy-fund/", icon: SIGNATURE_ASSETS.financing },
  { label: "EasySign", url: "https://yachtway.com/yacht-purchase-agreement/", icon: SIGNATURE_ASSETS.easysign },
  { label: "YachtWay Studio", url: "https://yachtway.com/studio/", icon: SIGNATURE_ASSETS.studio },
];


const TEXT = "#22222d";
const MUTED = "#5b5b66";

function tel(p: SignatureProfile): string {
  return p.phoneOpen || p.phone?.replace(/[^\d+]/g, "") || "";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Fallback avatar text when a user has not uploaded a headshot yet. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function icon18(src: string, alt = ""): string {
  return `<img src="${esc(src)}" alt="${esc(
    alt,
  )}" width="18" height="18" style="display:block;width:18px;height:18px;border:0;outline:none;text-decoration:none;" />`;
}

/** Icon + link row (website / email / phone), exactly as the generator emits it. */
function contactRow(iconUrl: string, alt: string, href: string, label: string): string {
  return `<tr>
        <td style="padding:0;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="height:28px;">
            <tr>
              <td style="width:18px;min-width:18px;height:18px;vertical-align:middle;">${icon18(iconUrl, alt)}</td>
              <td style="width:6px;min-width:6px;font-size:0;line-height:0;">&nbsp;</td>
              <td style="vertical-align:middle;">
                <a href="${esc(href)}" style="font-family:Figtree,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:400;color:${TEXT};text-decoration:none;">${esc(label)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

const SPACER = `<tr><td height="5" style="font-size:0;line-height:0;">&nbsp;</td></tr>`;

/**
 * Full HTML signature, ready to paste into a mail client. This mirrors the
 * markup produced by the YachtWay signature-generator (600x315 card, 202x221
 * headshot, Poppins name / Figtree details, product link footer).
 */
export function buildSignatureHtml(
  profile: SignatureProfile,
  links: SignatureLink[] = DEFAULT_SIGNATURE_LINKS,
  socials: SignatureLink[] = SIGNATURE_SOCIALS,
): string {
  const width = profile.width || "250px";
  const phoneHref = tel(profile);
  const site = profile.website.replace(/^https?:\/\//, "");

  const photo = profile.image
    ? `<img src="${esc(profile.image)}" alt="${esc(
        profile.name,
      )}" width="202" height="221" style="display:block;width:202px;height:221px;border:0;border-radius:4px;outline:none;text-decoration:none;" />`
    : `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:202px;height:221px;background:#f4f5f7;border-radius:4px;"><tr><td align="center" valign="middle" style="width:202px;height:221px;text-align:center;font-family:Poppins,Arial,sans-serif;font-size:56px;font-weight:500;color:${MUTED};">${esc(
        initials(profile.name),
      )}</td></tr></table>`;

  const socialRow = socials
    .map(
      (s, i) =>
        `<td style="padding:0 ${i === socials.length - 1 ? "0" : "24px"} 0 0;vertical-align:middle;">
            <a href="${esc(s.url)}" target="_blank" style="text-decoration:none;">${icon18(
              s.icon ?? "",
              s.label,
            )}</a>
          </td>`,
    )
    .join("");

  const linkRow = links
    .map(
      (l, i) =>
        `<td style="vertical-align:middle;white-space:nowrap;">
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="height:22px;">
              <tr>
                <td style="width:18px;min-width:18px;vertical-align:middle;">
                  <a href="${esc(l.url)}" target="_blank" style="display:block;text-decoration:none;">${icon18(
                    l.icon ?? "",
                  )}</a>
                </td>
                <td style="width:5px;min-width:5px;font-size:0;line-height:0;">&nbsp;</td>
                <td style="vertical-align:middle;">
                  <a href="${esc(l.url)}" target="_blank" style="font-family:Figtree,Arial,sans-serif;font-size:13px;line-height:20px;font-weight:500;color:#2f2f39;text-decoration:underline;white-space:nowrap;">${esc(
                    l.label,
                  )}</a>
                </td>
              </tr>
            </table>
          </td>${
            i === links.length - 1
              ? ""
              : `<td style="width:36px;min-width:36px;font-size:0;line-height:0;">&nbsp;</td>`
          }`,
    )
    .join("");

  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:600px;border-collapse:collapse;background:#ffffff;font-family:Arial,sans-serif;">
  <tr>
    <td style="padding:20px 0 20px 20px;vertical-align:top;">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:429px;height:221px;">
        <tr>
          <td style="width:202px;vertical-align:top;padding:0;">${photo}</td>
          <td style="width:20px;min-width:20px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="width:207px;vertical-align:top;padding:16px 0 0 0;">
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:207px;">
              <tr>
                <td style="padding:0;">
                  <div style="width:${esc(
                    width,
                  )};font-family:Poppins,Arial,sans-serif;font-size:28px;line-height:40px;font-weight:400;color:${TEXT};white-space:nowrap;">${esc(
                    profile.name,
                  )}</div>
                  <div style="font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:500;color:rgba(34,34,45,0.8);white-space:nowrap;">${esc(
                    profile.position,
                  )}</div>
                </td>
              </tr>
              <tr><td height="4" style="font-size:0;line-height:0;">&nbsp;</td></tr>
              ${contactRow(SIGNATURE_ASSETS.globe, "Website", `https://${esc(site)}`, profile.website)}
              ${SPACER}
              ${contactRow(SIGNATURE_ASSETS.mail, "Email", `mailto:${profile.email}`, profile.email)}
              ${
                profile.phone
                  ? `${SPACER}${contactRow(SIGNATURE_ASSETS.phone, "Phone", `tel:${phoneHref}`, profile.phone)}`
                  : ""
              }
              <tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr>
                <td>
                  <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                    <tr>${socialRow}</tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="border-top:1px solid rgba(112,128,144,0.14);padding:16px 20px 16px 20px;vertical-align:top;">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:560px;">
        <tr>${linkRow}</tr>
      </table>
    </td>
  </tr>
</table>`;
}



/** Plain-text fallback used when logging an email inside the CRM. */
export function buildSignatureText(
  profile: SignatureProfile,
  links: SignatureLink[] = DEFAULT_SIGNATURE_LINKS,
): string {
  return [
    profile.name,
    profile.position,
    profile.website,
    profile.email,
    profile.phone,
    links.map((l) => l.label).join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Parse a signature entry pasted from the generator repo. Accepts the JS/JSON
 * object snippet used in the repo's people array, e.g.
 * `{ name: "Roman Maistrenko", position: "Head of Development", ... }`.
 */
export function parseSignatureSnippet(input: string): Partial<SignatureProfile> | null {
  const text = input.trim();
  if (!text.includes("{")) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (end <= start) return null;
  const body = text.slice(start + 1, end);

  const keys = ["name", "position", "width", "image", "website", "email", "phone", "phoneOpen"] as const;
  const out: Partial<SignatureProfile> = {};
  for (const key of keys) {
    const re = new RegExp(`['"\`]?${key}['"\`]?\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`, "i");
    const m = body.match(re);
    if (m && m[2].trim()) out[key] = m[2].trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Parse a signature pasted from the signature-generator repo - either the
 * object snippet from the repo or the rendered signature HTML - back into
 * profile fields, so the CRM can populate the YachtWay look automatically.
 */
export function parseSignatureHtml(input: string): Partial<SignatureProfile> | null {
  const snippet = parseSignatureSnippet(input);
  if (snippet) return snippet;

  if (typeof DOMParser === "undefined" || !input.trim()) return null;
  const doc = new DOMParser().parseFromString(input, "text/html");
  const root = doc.body;
  if (!root || !root.textContent?.trim()) return null;

  const out: Partial<SignatureProfile> = {};


  const mailto = root.querySelector('a[href^="mailto:"]');
  if (mailto) out.email = (mailto.getAttribute("href") || "").replace(/^mailto:/i, "").trim();

  const tel = root.querySelector('a[href^="tel:"]');
  if (tel) {
    out.phone = (tel.textContent || "").trim();
    out.phoneOpen = (tel.getAttribute("href") || "").replace(/^tel:/i, "").trim();
  }

  const site = Array.from(root.querySelectorAll("a")).find((a) => {
    const href = a.getAttribute("href") || "";
    return /^https?:/i.test(href) && !/instagram|youtube|linkedin|facebook|twitter|x\.com/i.test(href);
  });
  if (site) out.website = (site.textContent || "").trim() || site.getAttribute("href")!.replace(/^https?:\/\//, "");

  const photo = Array.from(root.querySelectorAll("img")).find((img) => {
    const src = img.getAttribute("src") || "";
    const w = Number(img.getAttribute("width") || 0);
    return !!src && !/logo|icon/i.test(src) && (w === 0 || w >= 48);
  });
  if (photo) out.image = photo.getAttribute("src") || "";

  // Name / position: the two largest text lines that are not links.
  const lines = (root.textContent || "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((l) => l !== out.email && l !== out.website && l !== out.phone);
  const skip = /yacht ?way|mastercover|financing|easysign|studio|your yacht/i;
  const candidates = lines.filter((l) => !skip.test(l) && l.length < 60);
  if (candidates[0]) out.name = candidates[0];
  if (candidates[1]) out.position = candidates[1];

  const hasAny = Object.values(out).some((v) => typeof v === "string" && v.length > 0);
  return hasAny ? out : null;
}


/** Copy the signature to the clipboard as rich HTML (with a text fallback). */
export async function copySignatureToClipboard(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reference entry from the signature-generator repo. This is the exact shape
 * an admin pastes into the CRM, and the source of the preview shown in the
 * admin signatures screen.
 */
export const REFERENCE_SIGNATURE_SNIPPET = `{
  name: "Sarah Bennett",
  position: "Digital Assistant",
  width: "250px",
  image: "https://assets.yachtway.com/email-signatures/sarah.png",
  website: "YachtWay.com",
  email: "Support@YachtWay.com",
}`;

export const REFERENCE_SIGNATURE_PROFILE: SignatureProfile = {
  name: "Sarah Bennett",
  position: "Digital Assistant",
  width: "250px",
  image: "https://assets.yachtway.com/email-signatures/sarah.png",
  website: "YachtWay.com",
  email: "Support@YachtWay.com",
};
