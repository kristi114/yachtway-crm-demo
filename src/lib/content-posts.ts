import { LISTINGS } from "@/lib/mock-data";

/**
 * Content calendar (synced from Notion).
 *
 * This is a read-only snapshot of the SMM team's Notion "Content calendar →
 * Tasks" database. Each post mirrors the Notion schema (Task name, Type,
 * Channels, Status, Due, Dealer, Listing URL, Final Material). The backend
 * Notion sync populates this store on a schedule; here it's seeded so the
 * post ↔ listing linking is demonstrable.
 *
 * Linking: a post's `listingUrl` (Notion "Listing" property) is resolved to a
 * CRM listing by matching the public listing URL (or the listing id embedded
 * in it). See `resolveListingId`.
 */

export interface ContentPost {
  id: string;
  notionUrl: string;
  taskName: string;
  type: string[];       // "Listing Post" | "Listing Reel" | "Listing Stories" | "EasyFund" | …
  channels: string[];   // "IG Main" | "IG Hub" | "FB Main" | "FB Hub" | "YouTube" | "TikTok" | "LinkedIn"
  status: ContentStatus;
  dueDate: string;      // yyyy-mm-dd
  dealer: string;
  listingUrl: string | null;
  finalMaterial: string | null;
}

export type ContentStatus =
  | "Not Started" | "Drafting" | "Reviewing" | "Approve" | "Needs correction" | "Published";

/** When the Notion snapshot below was last synced (mock). */
export const CONTENT_SYNCED_AT = "2026-07-27T09:00:00Z";
export const CONTENT_CALENDAR_URL = "https://app.notion.com/p/2006d212272c805ea980c885a15a453c";

/** Notion channel → YachtWay account (Main = YachtWay, Hub = YachtWay Hub). */
export function channelAccount(channel: string): string {
  if (channel.endsWith("Main")) return "YachtWay";
  if (channel.endsWith("Hub")) return "YachtWay Hub";
  return "YachtWay";
}

// Public listing URLs pulled from the seed listings so links resolve.
const url = (id: string) => LISTINGS.find((l) => l.id === id)?.listingUrl ?? null;

const POSTS: ContentPost[] = [
  {
    id: "cp_riviera", notionUrl: "https://app.notion.com/p/aa01",
    taskName: "Riviera 6800 — sunset dock walkthrough",
    type: ["Listing Post"], channels: ["IG Main", "FB Main"], status: "Published",
    dueDate: "2026-07-22", dealer: "Riviera Miami", listingUrl: url("lst_001"), finalMaterial: "https://drive.google.com/file/riviera6800",
  },
  {
    id: "cp_azimut", notionUrl: "https://app.notion.com/p/aa02",
    taskName: "Azimut Grande 27M — golden hour reel",
    type: ["Listing Reel"], channels: ["IG Main", "IG Hub"], status: "Reviewing",
    dueDate: "2026-07-25", dealer: "Sunseeker FTL", listingUrl: url("lst_002"), finalMaterial: null,
  },
  {
    id: "cp_ferretti", notionUrl: "https://app.notion.com/p/aa03",
    taskName: "Ferretti 780 — 3 things buyers miss (stories)",
    type: ["Listing Stories"], channels: ["IG Hub"], status: "Drafting",
    dueDate: "2026-07-29", dealer: "Allied Marine", listingUrl: url("lst_003"), finalMaterial: null,
  },
  {
    id: "cp_pershing", notionUrl: "https://app.notion.com/p/aa04",
    taskName: "Pershing 8X — 3D tour teaser",
    type: ["3d Tour", "Future Spotlight Teaser"], channels: ["YouTube", "IG Main"], status: "Approve",
    dueDate: "2026-08-01", dealer: "Pershing Newport", listingUrl: url("lst_004"), finalMaterial: null,
  },
  {
    id: "cp_sunseeker", notionUrl: "https://app.notion.com/p/aa05",
    taskName: "Sunseeker Predator 65 — spec highlight",
    type: ["Listing Post"], channels: ["FB Main"], status: "Not Started",
    dueDate: "2026-08-04", dealer: "Coastline Brokerage", listingUrl: url("lst_005"), finalMaterial: null,
  },
  {
    // Real post from the Notion calendar — a program promo, not tied to a listing.
    id: "cp_cashback", notionUrl: "https://app.notion.com/p/3886d212272c8012ae7eee491e5a1a0c",
    taskName: "YachtWay Cashback",
    type: ["EasyFund", "YW Promo"], channels: ["IG Main", "FB Main", "IG Hub"], status: "Published",
    dueDate: "2026-06-28", dealer: "", listingUrl: null, finalMaterial: "https://cash.yachtway.com/",
  },
];

const norm = (u: string) => u.trim().toLowerCase().replace(/\/+$/, "");

/** Resolve a post's Notion Listing URL to a CRM listing id (or null). */
export function resolveListingId(post: Pick<ContentPost, "listingUrl">): string | null {
  if (!post.listingUrl) return null;
  const target = norm(post.listingUrl);
  const byUrl = LISTINGS.find((l) => typeof l.listingUrl === "string" && norm(l.listingUrl) === target);
  if (byUrl) return byUrl.id;
  // Fallback: the listing id appears in the URL path.
  const byId = LISTINGS.find((l) => target.includes(l.id.toLowerCase()));
  return byId?.id ?? null;
}

export function allPosts(): ContentPost[] {
  return [...POSTS].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

/** Posts whose resolved listing matches `listingId`. */
export function postsForListing(listingId: string): ContentPost[] {
  return allPosts().filter((p) => resolveListingId(p) === listingId);
}
