import { Router } from "express";
import { withRole } from "../permissions/rls.js";
import { applyRecipientEvent } from "../emails/sendService.js";

/**
 * PUBLIC email tracking + unsubscribe. No CRM session: the recipient's mail
 * client calls these. The per-recipient `trackingToken` (a random UUID stored on
 * email_recipients) is the only credential, so it must be unguessable — it is
 * never derived from the address.
 *
 * Writes run under the INTEGRATION system role so RLS still governs them.
 * Every endpoint answers 200 regardless of whether the token matched: a mail
 * client must not be able to probe which tokens are real, and a broken pixel in
 * someone's inbox is worse than a silently ignored hit.
 */
const router: Router = Router();

/** 1x1 transparent GIF. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function sendPixel(res: import("express").Response): void {
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.status(200).end(PIXEL);
}

/** Open pixel. */
router.get("/e/o/:token", async (req, res) => {
  try {
    await withRole("INTEGRATION", async (tx) => {
      const r = await tx.emailRecipient.findUnique({
        where: { trackingToken: String(req.params.token) },
        select: { id: true },
      });
      if (r) await applyRecipientEvent(tx, r.id, "opened");
    });
  } catch {
    // Never let a tracking failure surface in the recipient's inbox.
  }
  sendPixel(res);
});

/** Click redirect: records the click, then forwards to the real destination. */
router.get("/e/c/:token", async (req, res) => {
  const target = typeof req.query.u === "string" ? req.query.u : null;
  try {
    await withRole("INTEGRATION", async (tx) => {
      const r = await tx.emailRecipient.findUnique({
        where: { trackingToken: String(req.params.token) },
        select: { id: true },
      });
      if (r) await applyRecipientEvent(tx, r.id, "clicked");
    });
  } catch {
    /* fall through to the redirect regardless */
  }
  // Only http(s) targets, and never an open redirect chain we can't parse.
  if (target) {
    try {
      const url = new URL(target);
      if (url.protocol === "http:" || url.protocol === "https:") {
        res.redirect(302, url.toString());
        return;
      }
    } catch {
      /* malformed target */
    }
  }
  res.status(204).end();
});

/**
 * Recipient-facing page shell. Table layout, every colour inline, near-black on
 * off-white, no purple — the same rules the emails follow, since this is the page
 * those emails link to. Copy follows the brand rules too: no contractions, no em
 * dashes, no exclamation points.
 */
function page(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0; padding:0; background-color:#F9F9F9;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; background-color:#F9F9F9;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="width:600px; max-width:600px; background-color:#FFFFFF;">
      <tr><td style="padding:32px 32px 24px; font-family:'Figtree',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.65; color:#3C3C3C;">
        <h1 style="margin:0 0 16px 0; font-family:'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:24px; line-height:1.3; color:#1A1A1A;">${title}</h1>
        ${bodyHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Full-width near-black button, submitted as a form so no JavaScript is needed. */
function actionButton(action: string, label: string): string {
  return `<form method="post" action="${action}" style="margin:0 0 12px 0;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;">
    <tr><td align="center" bgcolor="#1A1A1A" style="background-color:#1A1A1A; border-radius:6px;">
      <button type="submit" style="display:block; box-sizing:border-box; width:100%; padding:16px 24px; border:0; background-color:#1A1A1A; font-family:'Figtree',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; line-height:1.2; color:#FFFFFF; text-align:center; cursor:pointer;">
        <span style="color:#FFFFFF;">${label}</span>
      </button>
    </td></tr>
  </table>
</form>`;
}

/**
 * ONE-CLICK unsubscribe (RFC 8058). This exact URL is what goes in the
 * List-Unsubscribe header, and the spec requires a bare POST to act immediately
 * with no further interaction — Gmail and Yahoo POST it when someone uses the
 * native "Unsubscribe" control next to the sender name. So the POST never asks a
 * question; it opts the contact out and answers.
 *
 * The GET below is the same URL followed by a HUMAN clicking the footer link, and
 * that one offers a choice instead. Splitting by method is what lets a single
 * unsubscribe link satisfy both: machines get the immediate action they require,
 * people get to change their mind before it happens.
 */
router.post("/e/u/:token", async (req, res) => {
  const done = await unsubscribe(String(req.params.token));
  res.status(200).json({ ok: true, applied: done });
});

/**
 * The footer link. Renders the choice — manage preferences or stop everything —
 * and deliberately has NO side effect, so landing here does not silently
 * unsubscribe someone who was only curious. Mail-client link prefetchers also GET
 * these URLs, which is a second reason the GET must not mutate.
 *
 * The page is identical whether or not the token resolves, matching the rest of
 * this router: a valid token must not be distinguishable from an invalid one. That
 * costs some UX — we cannot say "you are currently subscribed" without leaking
 * token validity — and buys not having an oracle on a public endpoint.
 */
router.get("/e/u/:token", async (req, res) => {
  const token = encodeURIComponent(String(req.params.token));
  res
    .status(200)
    .type("html")
    .send(
      page(
        "Email preferences",
        `<p style="margin:0 0 24px 0;">Choose what you would like to receive from YachtWay. Service email about your account, your listings and your transactions is not affected by this choice.</p>
         ${actionButton(`/e/u/${token}/all`, "Unsubscribe from all marketing email")}
         ${actionButton(`/e/u/${token}/resume`, "Keep receiving marketing email")}
         <p style="margin:16px 0 0 0; font-family:Lato,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#7a7a7a;">Your choice applies to the address this email was sent to. You can change it from the link in any email we send.</p>`,
      ),
    );
});

/** Unsubscribe from everything. The destructive choice, so it is a POST. */
router.post("/e/u/:token/all", async (req, res) => {
  await unsubscribe(String(req.params.token));
  res
    .status(200)
    .type("html")
    .send(
      page(
        "You are unsubscribed",
        `<p style="margin:0;">You will not receive further marketing email from YachtWay.</p>`,
      ),
    );
});

/** Stay subscribed, or undo an earlier opt-out. */
router.post("/e/u/:token/resume", async (req, res) => {
  await resubscribe(String(req.params.token));
  res
    .status(200)
    .type("html")
    .send(
      page(
        "You are subscribed",
        `<p style="margin:0;">Marketing email is on for this address. You can change this at any time from the link in any email we send.</p>`,
      ),
    );
});

/**
 * Undo an opt-out. Clears contact.emailOptOut, which is all the audience resolver
 * consults; the recipient row's historical status is left alone because it records
 * what happened on that send, not the person's current wish.
 *
 * Note this cannot revive someone suppressed by a "Do Not Contact" tag or by their
 * company's account-wide opt-out — those are decisions made on the YachtWay side,
 * and a recipient clicking a link should not be able to override them.
 */
async function resubscribe(token: string): Promise<boolean> {
  try {
    return await withRole("INTEGRATION", async (tx) => {
      const r = await tx.emailRecipient.findUnique({
        where: { trackingToken: token },
        select: { id: true, contactId: true },
      });
      if (!r?.contactId) return false;
      await tx.contact.update({
        where: { id: r.contactId },
        data: { emailOptOut: false },
      });
      return true;
    });
  } catch {
    return false;
  }
}

async function unsubscribe(token: string): Promise<boolean> {
  try {
    return await withRole("INTEGRATION", async (tx) => {
      const r = await tx.emailRecipient.findUnique({
        where: { trackingToken: token },
        select: { id: true, contactId: true },
      });
      if (!r) return false;
      await tx.emailRecipient.update({
        where: { id: r.id },
        data: { status: "unsubscribed" },
      });
      if (r.contactId) {
        await tx.contact.update({
          where: { id: r.contactId },
          data: { emailOptOut: true },
        });
      }
      return true;
    });
  } catch {
    return false;
  }
}

export default router;
