/**
 * Email send scheduling — the five dispatch modes the campaign sender offers.
 *
 *   now    → dispatch immediately
 *   at     → dispatch once, at a specific local time in a chosen timezone
 *   batch  → drip a large audience in fixed-size batches on an interval, only on
 *            chosen weekdays and inside a daily time window
 *   rss    → dispatch whenever a watched RSS feed publishes a new item
 *   smart  → dispatch per recipient at their historically best engagement time,
 *            inside a delivery window
 *
 * Everything here is pure config + preview math. Actual dispatch is a server
 * concern (see INTEGRATIONS.md): the browser can't be trusted to hold a
 * schedule, so `describeSchedule` / `batchPlan` exist to show the operator
 * exactly what the backend will do before they commit.
 */

export type SendMode = "now" | "at" | "batch" | "rss" | "smart";

export type RepeatUnit = "minutes" | "hours" | "days";

/** 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Timezones offered for scheduling. Kept short and marine-market relevant. */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Monaco",
  "Europe/Amsterdam",
  "Australia/Sydney",
  "UTC",
];

export interface BatchConfig {
  /** Contacts per batch. */
  quantity: number;
  /** Wait this long between batches. */
  repeatAfter: number;
  repeatUnit: RepeatUnit;
  /** Only send on these weekdays. */
  sendOnDays: Weekday[];
  /** Daily window, "HH:MM" 24h. Empty = no restriction. */
  startsAt: string;
  endsAt: string;
}

export interface RssConfig {
  feedUrl: string;
  /** How often to poll the feed. */
  checkEvery: "hourly" | "daily" | "weekly";
  /** Only send if at least this many new items are waiting. */
  minItems: number;
}

export interface SmartConfig {
  /** Spread delivery across this many hours around each contact's best time. */
  windowHours: number;
  /** Never deliver outside these local hours for the recipient. */
  earliestHour: number;
  latestHour: number;
}

export interface SendSchedule {
  mode: SendMode;
  /** For "at" / "batch": local start datetime, "YYYY-MM-DDTHH:MM". */
  startAt: string;
  timezone: string;
  batch: BatchConfig;
  rss: RssConfig;
  smart: SmartConfig;
}

export function defaultSchedule(): SendSchedule {
  return {
    mode: "now",
    startAt: localDatetimeInput(new Date(Date.now() + 60 * 60 * 1000)),
    timezone: guessTimezone(),
    batch: {
      quantity: 50,
      repeatAfter: 1,
      repeatUnit: "hours",
      sendOnDays: [...ALL_WEEKDAYS],
      startsAt: "",
      endsAt: "",
    },
    rss: { feedUrl: "", checkEvery: "daily", minItems: 1 },
    smart: { windowHours: 12, earliestHour: 8, latestHour: 20 },
  };
}

export function guessTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONES.includes(tz) ? tz : "America/New_York";
  } catch {
    return "America/New_York";
  }
}

/** `<input type="datetime-local">` value for a Date, in local time. */
export function localDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** Current UTC offset label for a timezone, e.g. "GMT-04:00". */
export function offsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return parts?.value ?? "";
  } catch {
    return "";
  }
}

const UNIT_MS: Record<RepeatUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export interface BatchPlan {
  batches: number;
  perBatch: number;
  /** Total elapsed time from first to last batch, in ms. */
  spanMs: number;
  /** Human summary of how long the drip takes. */
  spanLabel: string;
  /** Warnings that would surprise the operator (e.g. a multi-month drip). */
  warning: string | null;
}

/**
 * How a batch drip will play out for an audience of `recipients`.
 *
 * The span is the *interval* time only — it deliberately ignores weekday and
 * daily-window restrictions, which can only stretch it. When restrictions are
 * active we say so rather than pretending to a precision we don't have.
 */
export function batchPlan(recipients: number, batch: BatchConfig): BatchPlan {
  const perBatch = Math.max(1, Math.floor(batch.quantity) || 1);
  const batches = Math.max(1, Math.ceil(recipients / perBatch));
  const gaps = Math.max(0, batches - 1);
  const spanMs = gaps * Math.max(1, batch.repeatAfter) * UNIT_MS[batch.repeatUnit];

  const restricted =
    batch.sendOnDays.length < 7 || Boolean(batch.startsAt) || Boolean(batch.endsAt);

  let warning: string | null = null;
  if (batch.sendOnDays.length === 0) {
    warning = "No send days selected — the drip can never run.";
  } else if (spanMs > 30 * 86_400_000) {
    warning = "This drip takes over a month to finish. Raise the batch size or shorten the interval.";
  }

  return {
    batches,
    perBatch,
    spanMs,
    spanLabel: humanDuration(spanMs) + (restricted ? " of sending time (longer in practice)" : ""),
    warning,
  };
}

export function humanDuration(ms: number): string {
  if (ms <= 0) return "immediate";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** One-line summary of the schedule, shown on the send button and the report. */
export function describeSchedule(s: SendSchedule, recipients: number): string {
  switch (s.mode) {
    case "now":
      return `Sending immediately to ${recipients}`;
    case "at":
      return `Scheduled for ${s.startAt.replace("T", " ")} (${s.timezone})`;
    case "batch": {
      const plan = batchPlan(recipients, s.batch);
      const days =
        s.batch.sendOnDays.length === 7
          ? "every day"
          : WEEKDAYS.filter((w) => s.batch.sendOnDays.includes(w.day)).map((w) => w.label).join(", ");
      const window =
        s.batch.startsAt && s.batch.endsAt ? ` between ${s.batch.startsAt}–${s.batch.endsAt}` : "";
      return `${plan.batches} batch${plan.batches === 1 ? "" : "es"} of ${plan.perBatch}, every ${
        s.batch.repeatAfter
      } ${s.batch.repeatUnit}, ${days}${window}`;
    }
    case "rss":
      return s.rss.feedUrl
        ? `On new items from ${s.rss.feedUrl} (checked ${s.rss.checkEvery})`
        : "RSS feed URL required";
    case "smart":
      return `Smart Send — best time per recipient, ${s.smart.earliestHour}:00–${s.smart.latestHour}:00 local`;
  }
}

/** Blocking problems with the current schedule; empty = good to send. */
export function scheduleErrors(s: SendSchedule): string[] {
  const out: string[] = [];
  if (s.mode === "at" || s.mode === "batch") {
    if (!s.startAt) out.push("Pick a start date and time.");
  }
  if (s.mode === "batch") {
    if (s.batch.sendOnDays.length === 0) out.push("Select at least one send day.");
    if (s.batch.quantity < 1) out.push("Batch quantity must be at least 1.");
    if (s.batch.repeatAfter < 1) out.push("Repeat interval must be at least 1.");
    if (s.batch.startsAt && s.batch.endsAt && s.batch.startsAt >= s.batch.endsAt) {
      out.push("Daily window end time must be after the start time.");
    }
  }
  if (s.mode === "rss" && !s.rss.feedUrl.trim()) out.push("Add the RSS feed URL.");
  if (s.mode === "smart" && s.smart.earliestHour >= s.smart.latestHour) {
    out.push("Smart Send window end hour must be after the start hour.");
  }
  return out;
}

/** ISO instant the send should first fire, or null for immediate/event-driven. */
export function firstFireAt(s: SendSchedule): string | null {
  if (s.mode === "now" || s.mode === "rss") return null;
  if (!s.startAt) return null;
  const d = new Date(s.startAt);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
