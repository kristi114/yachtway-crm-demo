import { dueFollowUps, sendFollowUp } from "@/lib/email-send";
import { nonOpenersFor } from "@/lib/email-recipients";

/**
 * Drives the "re-send to non-openers after X days" option configured on a send.
 *
 * In this standalone build there is no server scheduler, so the check runs
 * client-side whenever the app loads (and hourly while it stays open). Because
 * `sendFollowUp` stamps `followUp.sentId` on the original, a campaign can only
 * ever produce one follow-up no matter how often this runs.
 *
 * When the backend lands this becomes a cron/worker job: select sends where
 * follow_up_due_at <= now() and follow_up_sent_id IS NULL, resolve non-openers
 * from Mailgun events, send, then stamp the row in the same transaction.
 */
export async function runDueFollowUps(now = new Date()): Promise<number> {
  const due = dueFollowUps(now);
  let sent = 0;
  for (const original of due) {
    const nonOpeners = nonOpenersFor(original);
    const record = await sendFollowUp(original.id, nonOpeners);
    if (record) sent += 1;
  }
  return sent;
}

let started = false;

/** Start the periodic check once per app session (no-op on the server). */
export function startFollowUpRuntime() {
  if (started || typeof window === "undefined") return;
  started = true;
  void runDueFollowUps();
  window.setInterval(() => void runDueFollowUps(), 60 * 60 * 1000);
}
