import { DEMO_USER_LIST } from "@/lib/auth";

// ==========================================================
// Weekly report helpers
// ----------------------------------------------------------
// Auto-triggered end-of-week performance reports for sales reps.
// Numbers are derived deterministically from a per-rep base so the
// same rep always shows the same weekly figures across renders.
// ==========================================================

// Per-rep 30-day outreach baselines (kept in sync with rep-activity-panel).
// Used to derive weekly buckets.
const BASE_30D: Record<string, number> = {
  u_rep:    142 + 318 + 96,   // calls + emails + messages
  u_fin:    88  + 214 + 61,
  u_rep_eu: 176 + 402 + 133,
  u_rep_uk: 61  + 189 + 42,
};

function baseFor(userId: string): number {
  return BASE_30D[userId] ?? 300;
}

// Cheap deterministic hash so weekly numbers vary per (userId, weekOffset).
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 0xffffffff;
}

function weeklyTouches(userId: string, weekOffset: number): number {
  // weekOffset: 0 = current week, 1 = last week, ...
  const base = baseFor(userId) / 4;              // rough weekly baseline
  const jitter = (hash(`${userId}::${weekOffset}`) - 0.5) * 0.4; // ±20%
  return Math.max(0, Math.round(base * (1 + jitter)));
}

export interface RepWeeklySnapshot {
  thisWeek: number;
  lastWeek: number;
  threeWeekAvg: number;
}

export function getRepWeeklySnapshot(userId: string): RepWeeklySnapshot {
  const full = weeklyTouches(userId, 0);
  const lastWeek = weeklyTouches(userId, 1);
  const prior3 = [1, 2, 3].map((k) => weeklyTouches(userId, k));
  const threeWeekAvg = Math.round(prior3.reduce((s, n) => s + n, 0) / prior3.length);
  // Prorate "thisWeek" by how much of the week has elapsed so mid-week
  // numbers make sense for pace comparisons.
  const dayOfWeek = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
  const elapsed = elapsedWeekFraction(dayOfWeek);
  const thisWeek = Math.round(full * elapsed);
  return { thisWeek, lastWeek, threeWeekAvg };
}

// Fraction of the workweek elapsed. Weight weekdays heavier than weekends
// so mid-week pace projections reflect real selling hours.
function elapsedWeekFraction(dayOfWeek: number): number {
  // cumulative share of touches by end-of-day for Mon..Sun
  const cum = [0.22, 0.44, 0.64, 0.84, 0.96, 0.99, 1.0];
  return cum[Math.min(6, Math.max(0, dayOfWeek))];
}

// ==========================================================
// Pace helpers - always sets a target a few % above last week
// so the rep is nudged to beat their previous week.
// ==========================================================
export interface RepPace {
  dayOfWeek: number;             // Mon=0..Sun=6
  elapsedPct: number;            // 0..100 - share of the week that's gone
  targetTotal: number;           // full-week goal (last week + stretch)
  stretchPct: number;            // % above last week that target represents
  expectedByNow: number;         // what "on pace" looks like right now
  actualByNow: number;           // touches booked so far this week
  projectedTotal: number;        // linear projection of full-week result
  paceDeltaPct: number;          // +% vs expected-by-now (on-pace = 0)
  projectionDeltaPct: number;    // projected vs last week (+ = beating it)
  onPace: boolean;               // actual >= expectedByNow
}

export function getRepPace(userId: string, ref = new Date()): RepPace {
  const snap = getRepWeeklySnapshot(userId);
  const dayOfWeek = (ref.getDay() + 6) % 7;
  const elapsed = elapsedWeekFraction(dayOfWeek);
  // Stretch target: a few % ahead of last week (5-8%, deterministic per rep+week).
  const stretchPct = 5 + Math.round(hash(`${userId}::pace::${startOfWeek(ref).toISOString()}`) * 3);
  const targetTotal = Math.max(1, Math.round(snap.lastWeek * (1 + stretchPct / 100)));
  const expectedByNow = Math.round(targetTotal * elapsed);
  const actualByNow = snap.thisWeek;
  const projectedTotal = elapsed > 0 ? Math.round(actualByNow / elapsed) : 0;
  const paceDeltaPct = expectedByNow > 0
    ? Math.round(((actualByNow - expectedByNow) / expectedByNow) * 100)
    : 0;
  const projectionDeltaPct = snap.lastWeek > 0
    ? Math.round(((projectedTotal - snap.lastWeek) / snap.lastWeek) * 100)
    : 0;
  return {
    dayOfWeek,
    elapsedPct: Math.round(elapsed * 100),
    targetTotal,
    stretchPct,
    expectedByNow,
    actualByNow,
    projectedTotal,
    paceDeltaPct,
    projectionDeltaPct,
    onPace: actualByNow >= expectedByNow,
  };
}

// ==========================================================
// Report status - based on current day of week
// - Mon-Thu (0..3 with Monday=0):  "pending"     - not yet generated
// - Fri (4):                       "processing"  - being auto-generated
// - Sat/Sun (5..6):                "delivered"   - sent to admins
// ==========================================================
export type ReportState = "pending" | "processing" | "delivered";

export interface WeeklyReportStatus {
  state: ReportState;
  dayOfWeek: number;            // 0=Mon..6=Sun
  weekStart: Date;
  weekEnd: Date;
  deliveredLabel?: string;      // "Friday 6:00 PM"
}

function startOfWeek(ref = new Date()): Date {
  const d = new Date(ref);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function weeklyReportStatus(ref = new Date()): WeeklyReportStatus {
  const dayOfWeek = (ref.getDay() + 6) % 7; // Mon=0..Sun=6
  const weekStart = startOfWeek(ref);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  let state: ReportState;
  let deliveredLabel: string | undefined;
  if (dayOfWeek <= 3) {
    state = "pending";
  } else if (dayOfWeek === 4) {
    state = "processing";
  } else {
    state = "delivered";
    deliveredLabel = "Friday 6:00 PM";
  }
  return { state, dayOfWeek, weekStart, weekEnd, deliveredLabel };
}

export function formatWeekRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = start.toLocaleDateString(undefined, opts);
  const e = end.toLocaleDateString(undefined, opts);
  return `${s} – ${e}`;
}

// ==========================================================
// Admin roll-up helper
// ==========================================================
export interface RepReportRow {
  userId: string;
  userName: string;
  snapshot: RepWeeklySnapshot;
  wowDeltaPct: number;
  avgDeltaPct: number;
}

export function allRepReports(): RepReportRow[] {
  return DEMO_USER_LIST
    .filter((u) => u.role === "sales_rep" || u.role === "fintech")
    .map((u) => {
      const snapshot = getRepWeeklySnapshot(u.id);
      const wowDeltaPct = snapshot.lastWeek > 0
        ? Math.round(((snapshot.thisWeek - snapshot.lastWeek) / snapshot.lastWeek) * 100)
        : 0;
      const avgDeltaPct = snapshot.threeWeekAvg > 0
        ? Math.round(((snapshot.thisWeek - snapshot.threeWeekAvg) / snapshot.threeWeekAvg) * 100)
        : 0;
      return { userId: u.id, userName: u.name, snapshot, wowDeltaPct, avgDeltaPct };
    });
}
