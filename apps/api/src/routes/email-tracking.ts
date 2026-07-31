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
 * One-click unsubscribe. Sets the CONTACT's emailOptOut, which is the flag the
 * audience resolver honours — so the next send excludes them automatically and
 * records the suppression reason.
 */
router.post("/e/u/:token", async (req, res) => {
  const done = await unsubscribe(String(req.params.token));
  res.status(200).json({ ok: true, applied: done });
});

/** Same as the POST, for mail clients that only follow links. */
router.get("/e/u/:token", async (req, res) => {
  await unsubscribe(String(req.params.token));
  res
    .status(200)
    .type("html")
    .send(
      "<!doctype html><meta charset=utf-8><title>Unsubscribed</title>" +
        "<p style=\"font-family:system-ui;margin:3rem\">You've been unsubscribed. " +
        "You won't receive further marketing email from YachtWay.</p>",
    );
});

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
