/**
 * Mock social-media analytics for the Marketing → Social statistics dashboard.
 *
 * Shapes mirror what a real aggregator (Meta / LinkedIn / YouTube / TikTok /
 * Pinterest / GBP / Threads / Bluesky) would return per channel per period, so
 * the page can be pointed at live connectors later without UI changes.
 */

export type ChannelId =
  | "facebook" | "instagram" | "linkedin" | "tiktok"
  | "pinterest" | "youtube" | "gbp" | "threads" | "bluesky";

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
  { id: "pinterest", name: "Pinterest", color: "#E60023" },
  { id: "youtube", name: "YouTube", color: "#FF0000" },
  { id: "gbp", name: "GBP", color: "#4285F4" },
  { id: "threads", name: "Threads", color: "#000000" },
  { id: "bluesky", name: "Bluesky", color: "#0085FF" },
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
  /** Period-over-period % change for the headline engagement metric. */
  engagementTrendPct: number;
  impressionsTrendPct: number;
  reachTrendPct: number;
  postsTrendPct: number;
}

/** Per-channel stats for the selected period (Jul 21–27 2026 in the mock). */
export const CHANNEL_STATS: Record<ChannelId, ChannelStats> = {
  facebook:  { id: "facebook",  posts: 19, likes: 423,  comments: 0,   shares: 3,    impressions: 12_020,  reach: 7_860,  linkClicks: 0, followers: 210, engagementTrendPct: -46.62, impressionsTrendPct: -27.89, reachTrendPct: -29.09, postsTrendPct: -24 },
  instagram: { id: "instagram", posts: 7,  likes: 6_270, comments: 117, shares: 1_110, impressions: 193_310, reach: 62_350, linkClicks: 0, followers: 198, engagementTrendPct: -21.7, impressionsTrendPct: -19.31, reachTrendPct: -35.47, postsTrendPct: 40 },
  linkedin:  { id: "linkedin",  posts: 0,  likes: 4,    comments: 0,   shares: 0,    impressions: 113,     reach: 85,     linkClicks: 0, followers: 65,  engagementTrendPct: 0, impressionsTrendPct: 232.35, reachTrendPct: 466.67, postsTrendPct: 0 },
  tiktok:    { id: "tiktok",    posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
  pinterest: { id: "pinterest", posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
  youtube:   { id: "youtube",   posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
  gbp:       { id: "gbp",       posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
  threads:   { id: "threads",   posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
  bluesky:   { id: "bluesky",   posts: 0,  likes: 0,    comments: 0,   shares: 0,    impressions: 0,       reach: 0,      linkClicks: 0, followers: 0,   engagementTrendPct: 0, impressionsTrendPct: 0, reachTrendPct: 0, postsTrendPct: 0 },
};

/** Daily performance series (7 days, Tue → Mon). */
export interface DayPoint {
  day: string;
  facebookPosts: number;
  instagramPosts: number;
  impressions: number;
  likes: number;
  comments: number;
}

export const DAILY: DayPoint[] = [
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
}

export const TOP_POSTS: TopPost[] = [
  { id: "tp1", caption: "While the world fights for a berth in Port Hercule this weekend, the people who know better are docking in Italy. Cala del Forte si…", likes: 25_140, comments: 106, shares: 0, channel: "instagram" },
  { id: "tp2", caption: "They say diamonds are a girl's best friend. We think a superyacht glistening off Monaco is every bit as inspiring as a rock on a fing…", likes: 9_210, comments: 77, shares: 0, channel: "instagram" },
  { id: "tp3", caption: "Bravo Eugenia. 109 meters of gigayacht at anchor on the Côte d'Azur. Built by Oceanco. Designed by none other than the award …", likes: 6_270, comments: 53, shares: 0, channel: "instagram" },
  { id: "tp4", caption: "Are you ready for Monaco race weekend? The Grand Prix is here, and Port Hercule is the most valuable water on earth. Only 142 …", likes: 5_890, comments: 49, shares: 0, channel: "instagram" },
  { id: "tp5", caption: "The Monaco Grand Prix is over, and the track has its champion. But the better contest is the one anchored just outside Port Herc…", likes: 4_280, comments: 37, shares: 0, channel: "instagram" },
];

export interface AgeBand { label: string; value: number; }
export const AGE_BANDS: AgeBand[] = [
  { label: "13-17 Years Old", value: 2_010 },
  { label: "18-24 Years Old", value: 11_320 },
  { label: "25-34 Years Old", value: 19_240 },
  { label: "35-44 Years Old", value: 13_010 },
  { label: "45-54 Years Old", value: 12_000 },
  { label: "55-64 Years Old", value: 11_330 },
  { label: "65+ Years Old", value: 3_040 },
];

export const GENDER = { malePct: 59.3, male: 44_480, femalePct: 40.7, female: 30_520 };

/* -------- Aggregates -------- */
export function totals() {
  const list = Object.values(CHANNEL_STATS);
  return {
    posts: list.reduce((s, c) => s + c.posts, 0),
    likes: list.reduce((s, c) => s + c.likes, 0),
    followers: list.reduce((s, c) => s + c.followers, 0),
    impressions: list.reduce((s, c) => s + c.impressions, 0),
    comments: list.reduce((s, c) => s + c.comments, 0),
    reach: list.reduce((s, c) => s + c.reach, 0),
  };
}

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
