/**
 * Mock social-media analytics for the Marketing → Social statistics dashboard.
 *
 * Data is organised as ACCOUNTS (e.g. "YachtWay", "YachtWay Hub") → CHANNELS
 * (Meta/LinkedIn/…) → metrics. The page selects one or more accounts and the
 * helpers here aggregate across them. Shapes mirror what a real aggregator
 * would return per account per channel per period, so the page can point at
 * live connectors later without UI changes.
 */

export type ChannelId =
  | "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube";

export interface ChannelMeta {
  id: ChannelId;
  name: string;
  color: string;
}

export const CHANNELS: ChannelMeta[] = [
  { id: "facebook", name: "Facebook", color: "#1877F2" },
  { id: "instagram", name: "Instagram", color: "#E1306C" },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2" },
  { id: "tiktok", name: "TikTok", color: "#111111" },
  { id: "youtube", name: "YouTube", color: "#FF0000" },
];

export interface AccountMeta {
  id: string;
  name: string;
  /** Relative size vs the flagship account — used to scale the mock metrics. */
  scale: number;
}

export const ACCOUNTS: AccountMeta[] = [
  { id: "yachtway", name: "YachtWay", scale: 1 },
  { id: "hub", name: "YachtWay Hub", scale: 0.18 },
  { id: "charter", name: "YachtWay Charter", scale: 0.35 },
];

export interface ChannelStats {
  id: ChannelId;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  followers: number;
  engagementTrendPct: number;
  impressionsTrendPct: number;
  reachTrendPct: number;
  postsTrendPct: number;
}

/** Flagship (YachtWay) per-channel stats; other accounts scale from these. */
const BASE_CHANNEL_STATS: Record<ChannelId, ChannelStats> = {
  facebook:  { id: "facebook",  posts: 19, likes: 423,  comments: 0,   shares: 3,    impressions: 12_020,  reach: 7_860,  linkClicks: 0, followers: 210, engagementTrendPct: -46.62, impressionsTrendPct: -27.89, reachTrendPct: -29.09, postsTrendPct: -24 },
  instagram: { id: "instagram", posts: 7,  likes: 6_270, comments: 117, shares: 1_110, impressions: 193_310, reach: 62_350, linkClicks: 0, followers: 198, engagementTrendPct: -21.7, impressionsTrendPct: -19.31, reachTrendPct: -35.47, postsTrendPct: 40 },
  linkedin:  { id: "linkedin",  posts: 0,  likes: 4,    comments: 0,   shares: 0,    impressions: 113,     reach: 85,     linkClicks: 0, followers: 65,  engagementTrendPct: 0, impressionsTrendPct: 232.35, reachTrendPct: 466.67, postsTrendPct: 0 },
  tiktok:    { id: "tiktok",    posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
  youtube:   { id: "youtube",   posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
};

export interface DayPoint {
  day: string;
  facebookPosts: number;
  instagramPosts: number;
  impressions: number;
  likes: number;
  comments: number;
}

const BASE_DAILY: DayPoint[] = [
  { day: "Tue", facebookPosts: 1, instagramPosts: 1, impressions: 34_100, likes: 620, comments: 22 },
  { day: "Wed", facebookPosts: 1, instagramPosts: 0, impressions: 24_900, likes: 210, comments: 8 },
  { day: "Thu", facebookPosts: 1, instagramPosts: 1, impressions: 26_800, likes: 340, comments: 12 },
  { day: "Fri", facebookPosts: 1, instagramPosts: 1, impressions: 22_100, likes: 300, comments: 10 },
  { day: "Sat", facebookPosts: 11, instagramPosts: 2, impressions: 23_900, likes: 900, comments: 28 },
  { day: "Sun", facebookPosts: 4, instagramPosts: 2, impressions: 29_400, likes: 640, comments: 20 },
  { day: "Mon", facebookPosts: 0, instagramPosts: 0, impressions: 32_200, likes: 520, comments: 17 },
];

export interface TopPost {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  channel: ChannelId;
  accountId: string;
}

const BASE_TOP_POSTS: TopPost[] = [
  { id: "tp1", caption: "While the world fights for a berth in Port Hercule this weekend, the people who know better are docking in Italy. Cala del Forte si…", likes: 25_140, comments: 106, shares: 0, channel: "instagram", accountId: "yachtway" },
  { id: "tp2", caption: "They say diamonds are a girl's best friend. We think a superyacht glistening off Monaco is every bit as inspiring as a rock on a fing…", likes: 9_210, comments: 77, shares: 0, channel: "instagram", accountId: "yachtway" },
  { id: "tp3", caption: "Bravo Eugenia. 109 meters of gigayacht at anchor on the Côte d'Azur. Built by Oceanco. Designed by none other than the award …", likes: 6_270, comments: 53, shares: 0, channel: "instagram", accountId: "yachtway" },
  { id: "tp4", caption: "Are you ready for Monaco race weekend? The Grand Prix is here, and Port Hercule is the most valuable water on earth. Only 142 …", likes: 5_890, comments: 49, shares: 0, channel: "instagram", accountId: "charter" },
  { id: "tp5", caption: "The Monaco Grand Prix is over, and the track has its champion. But the better contest is the one anchored just outside Port Herc…", likes: 4_280, comments: 37, shares: 0, channel: "instagram", accountId: "hub" },
  { id: "tp6", caption: "Charter season is open. Here's where the fleet is heading this summer — and the three berths still worth chasing.", likes: 3_110, comments: 24, shares: 0, channel: "facebook", accountId: "hub" },
  { id: "tp7", caption: "Behind the scenes on a 40m refit: the yard, the timeline, and the one decision every owner gets wrong.", likes: 2_540, comments: 19, shares: 0, channel: "facebook", accountId: "charter" },
];

export interface AgeBand { label: string; value: number; }
const BASE_AGE_BANDS: AgeBand[] = [
  { label: "13-17 Years Old", value: 2_010 },
  { label: "18-24 Years Old", value: 11_320 },
  { label: "25-34 Years Old", value: 19_240 },
  { label: "35-44 Years Old", value: 13_010 },
  { label: "45-54 Years Old", value: 12_000 },
  { label: "55-64 Years Old", value: 11_330 },
  { label: "65+ Years Old", value: 3_040 },
];

const BASE_GENDER = { malePct: 59.3, male: 44_480, femalePct: 40.7, female: 30_520 };

/* ------------------------------------------------------------------ */
/* Aggregation across selected accounts                                 */
/* ------------------------------------------------------------------ */

function scaleSum(ids: string[]): number {
  return ACCOUNTS.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.scale, 0);
}
const r = (n: number, f: number) => Math.round(n * f);

/** Per-channel stats aggregated across the selected accounts, scaled by the
 * period multiplier (1 = 7 days, ~4.3 = 30 days, …). */
export function channelStatsFor(accountIds: string[], mult = 1): Record<ChannelId, ChannelStats> {
  const f = scaleSum(accountIds) * mult;
  const out = {} as Record<ChannelId, ChannelStats>;
  for (const c of CHANNELS) {
    const b = BASE_CHANNEL_STATS[c.id];
    out[c.id] = {
      ...b,
      posts: r(b.posts, f),
      likes: r(b.likes, f),
      comments: r(b.comments, f),
      shares: r(b.shares, f),
      impressions: r(b.impressions, f),
      reach: r(b.reach, f),
      linkClicks: r(b.linkClicks, f),
      followers: r(b.followers, scaleSum(accountIds)), // followers are a count, not period-cumulative
    };
  }
  return out;
}

export function dailyFor(accountIds: string[], mult = 1): DayPoint[] {
  const f = scaleSum(accountIds) * mult;
  return BASE_DAILY.map((d) => ({
    day: d.day,
    facebookPosts: r(d.facebookPosts, f),
    instagramPosts: r(d.instagramPosts, f),
    impressions: r(d.impressions, f),
    likes: r(d.likes, f),
    comments: r(d.comments, f),
  }));
}

export interface ChannelDayPoint {
  day: string;
  posts: number;
  impressions: number;
  likes: number;
  comments: number;
}

/** Daily series for a single channel: the aggregate daily curve apportioned by
 * that channel's share of impressions / posts / engagement. */
export function dailyForChannel(accountIds: string[], channel: ChannelId, mult = 1): ChannelDayPoint[] {
  const stats = channelStatsFor(accountIds, mult);
  const tot = totalsFor(stats);
  const s = stats[channel];
  const impShare = tot.impressions ? s.impressions / tot.impressions : 0;
  const likeShare = tot.likes ? s.likes / tot.likes : 0;
  const commentShare = tot.comments ? s.comments / tot.comments : 0;
  const postShare = tot.posts ? s.posts / tot.posts : 0;
  const base = dailyFor(accountIds, mult);
  return base.map((d) => ({
    day: d.day,
    posts: Math.round((d.facebookPosts + d.instagramPosts) * postShare),
    impressions: Math.round(d.impressions * impShare),
    likes: Math.round(d.likes * likeShare),
    comments: Math.round(d.comments * commentShare),
  }));
}

export function topPostsFor(accountIds: string[]): TopPost[] {
  return BASE_TOP_POSTS
    .filter((p) => accountIds.includes(p.accountId))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5);
}

export function demographyFor(accountIds: string[], mult = 1) {
  const f = scaleSum(accountIds) * mult;
  return {
    ageBands: BASE_AGE_BANDS.map((a) => ({ ...a, value: r(a.value, f) })),
    gender: {
      ...BASE_GENDER,
      male: r(BASE_GENDER.male, f),
      female: r(BASE_GENDER.female, f),
    },
  };
}

export function totalsFor(stats: Record<ChannelId, ChannelStats>) {
  const list = Object.values(stats);
  return {
    posts: list.reduce((s, c) => s + c.posts, 0),
    likes: list.reduce((s, c) => s + c.likes, 0),
    followers: list.reduce((s, c) => s + c.followers, 0),
    impressions: list.reduce((s, c) => s + c.impressions, 0),
    comments: list.reduce((s, c) => s + c.comments, 0),
    reach: list.reduce((s, c) => s + c.reach, 0),
  };
}

/* -------- Formatting helpers -------- */
export function compact(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 2 : 1)}K`;
  return String(n);
}
export function channelName(id: ChannelId): string {
  return CHANNELS.find((c) => c.id === id)?.name ?? id;
}
export function channelColor(id: ChannelId): string {
  return CHANNELS.find((c) => c.id === id)?.color ?? "#888";
}
