/**
 * Mock email-marketing analytics for the Statistics tab.
 *
 * Aggregate, campaign-level metrics (delivered/opened/clicked/…), a per-type
 * breakdown for the engagement bar chart, and an open-rate trend series. All
 * mock for this build; swap for the reporting API (or the Amplitude/Mailgun
 * event data in apps/api) when the backend is wired.
 */

export type CampaignTypeKey = "email" | "workflow" | "bulk" | "sequences";

export const CAMPAIGN_TYPES: { key: CampaignTypeKey; label: string; color: string }[] = [
  { key: "email", label: "Email Campaign", color: "#4f7bf5" },
  { key: "workflow", label: "Workflow Campaign", color: "#a855f7" },
  { key: "bulk", label: "Bulk Action Campaign", color: "#22c1e0" },
  { key: "sequences", label: "Email sequences", color: "#10b981" },
];

export interface CampaignStats {
  key: string;
  name: string;
  /** delivered broken down by campaign type (drives the stacked bar) */
  deliveredByType: Record<CampaignTypeKey, number>;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  spam: number;
  /** open-rate % trend, one point per day of the range */
  openRateTrend: { date: string; rate: number }[];
}

function trend(base: number, days: string[], seed: number): { date: string; rate: number }[] {
  return days.map((date, i) => {
    // Gentle deterministic wobble around the base rate.
    const wobble = Math.sin((i + seed) * 1.3) * 4 + (i - days.length / 2) * 0.6;
    return { date, rate: Math.max(0, Math.round((base + wobble) * 10) / 10) };
  });
}

/** The 7 days shown by default (matches the 2026-07-21 → 2026-07-27 range). */
export const DEFAULT_RANGE_DAYS = [
  "07-21",
  "07-22",
  "07-23",
  "07-24",
  "07-25",
  "07-26",
  "07-27",
];

const CAMPAIGNS: CampaignStats[] = [
  {
    key: "summer-boat-show",
    name: "Summer Boat Show Promo",
    deliveredByType: { email: 2600, workflow: 300, bulk: 500, sequences: 40 },
    delivered: 3440,
    opened: 1040,
    clicked: 560,
    bounced: 120,
    unsubscribed: 7,
    spam: 1,
    openRateTrend: trend(30, DEFAULT_RANGE_DAYS, 1),
  },
  {
    key: "new-listing-digest",
    name: "New Listing Digest",
    deliveredByType: { email: 1500, workflow: 700, bulk: 150, sequences: 30 },
    delivered: 2380,
    opened: 690,
    clicked: 360,
    bounced: 90,
    unsubscribed: 5,
    spam: 0,
    openRateTrend: trend(29, DEFAULT_RANGE_DAYS, 3),
  },
  {
    key: "dealer-onboarding",
    name: "Dealer Onboarding",
    deliveredByType: { email: 700, workflow: 300, bulk: 120, sequences: 20 },
    delivered: 1140,
    opened: 300,
    clicked: 130,
    bounced: 40,
    unsubscribed: 2,
    spam: 0,
    openRateTrend: trend(26, DEFAULT_RANGE_DAYS, 5),
  },
  {
    key: "broker-newsletter",
    name: "Broker Newsletter",
    deliveredByType: { email: 400, workflow: 100, bulk: 130, sequences: 12 },
    delivered: 642,
    opened: 145,
    clicked: 90,
    bounced: 30,
    unsubscribed: 2,
    spam: 0,
    openRateTrend: trend(23, DEFAULT_RANGE_DAYS, 7),
  },
];

export const CAMPAIGN_OPTIONS = [
  { key: "all", name: "All Campaigns" },
  ...CAMPAIGNS.map((c) => ({ key: c.key, name: c.name })),
];

function aggregate(): CampaignStats {
  const sum = (f: (c: CampaignStats) => number) => CAMPAIGNS.reduce((a, c) => a + f(c), 0);
  const deliveredByType = CAMPAIGN_TYPES.reduce(
    (acc, t) => {
      acc[t.key] = sum((c) => c.deliveredByType[t.key]);
      return acc;
    },
    {} as Record<CampaignTypeKey, number>,
  );
  // Weighted-average trend across campaigns (by delivered).
  const totalDelivered = sum((c) => c.delivered);
  const openRateTrend = DEFAULT_RANGE_DAYS.map((date, i) => {
    const rate =
      CAMPAIGNS.reduce((a, c) => a + c.openRateTrend[i].rate * c.delivered, 0) / totalDelivered;
    return { date, rate: Math.round(rate * 10) / 10 };
  });
  return {
    key: "all",
    name: "All Campaigns",
    deliveredByType,
    delivered: totalDelivered,
    opened: sum((c) => c.opened),
    clicked: sum((c) => c.clicked),
    bounced: sum((c) => c.bounced),
    unsubscribed: sum((c) => c.unsubscribed),
    spam: sum((c) => c.spam),
    openRateTrend,
  };
}

const ALL = aggregate();

export function getCampaignStats(key: string): CampaignStats {
  if (key === "all") return ALL;
  return CAMPAIGNS.find((c) => c.key === key) ?? ALL;
}

/** Rows for the engagement funnel/bar chart, stacked by campaign type. */
export function engagementRows(s: CampaignStats) {
  const share = (n: number) => {
    // Distribute a stage's total across types using the delivered mix.
    const total = s.delivered || 1;
    return CAMPAIGN_TYPES.reduce(
      (acc, t) => {
        acc[t.key] = Math.round((s.deliveredByType[t.key] / total) * n);
        return acc;
      },
      {} as Record<CampaignTypeKey, number>,
    );
  };
  return [
    { stage: "Delivered", total: s.delivered, ...share(s.delivered) },
    { stage: "Opened", total: s.opened, ...share(s.opened) },
    { stage: "Clicked", total: s.clicked, ...share(s.clicked) },
  ];
}

export function cumulativePct(s: CampaignStats) {
  const d = s.delivered || 1;
  return {
    Delivered: 100,
    Opened: Math.round((s.opened / d) * 100),
    Clicked: Math.round((s.clicked / d) * 100),
  };
}

export function openRatePct(s: CampaignStats): number {
  return s.delivered ? Math.round((s.opened / s.delivered) * 1000) / 10 : 0;
}
