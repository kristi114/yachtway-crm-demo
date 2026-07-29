import { useMemo } from "react";
import { CalendarClock, ExternalLink, Megaphone } from "lucide-react";

import { postsForListing, channelAccount, type ContentStatus } from "@/lib/content-posts";
import { formatDate } from "@/lib/format-date";

const STATUS_STYLE: Record<ContentStatus, string> = {
  Published: "bg-emerald-500/10 text-emerald-600",
  Approve: "bg-blue-500/10 text-blue-600",
  Reviewing: "bg-red-500/10 text-red-600",
  Drafting: "bg-amber-500/10 text-amber-700",
  "Needs correction": "bg-purple-500/10 text-purple-600",
  "Not Started": "bg-muted text-muted-foreground",
};

/**
 * Content posts (from the Notion content calendar) linked to this listing via
 * the post's Listing URL. Read-only; opens each post in Notion.
 */
export function ContentPostsPanel({ listingId }: { listingId: string }) {
  const posts = useMemo(() => postsForListing(listingId), [listingId]);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          <Megaphone className="h-4 w-4 text-brand" /> Content posts ({posts.length})
        </h3>
        <span className="text-[11px] text-muted-foreground">Synced from Notion</span>
      </header>

      {posts.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No content calendar posts linked to this listing yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {posts.map((p) => {
            const accounts = [...new Set(p.channels.map(channelAccount))];
            return (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a href={p.notionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-brand hover:underline">
                      {p.taskName} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {formatDate(p.dueDate)}</span>
                      <span>·</span>
                      <span>{accounts.join(", ")}</span>
                      <span>·</span>
                      <span>{p.channels.join(", ")}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.type.map((t) => (
                        <span key={t} className="rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-deep">{t}</span>
                      ))}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[p.status]}`}>
                    {p.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
