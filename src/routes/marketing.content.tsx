import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Boxes } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  allPosts, resolveListingId, channelAccount, CONTENT_SYNCED_AT, CONTENT_CALENDAR_URL,
  type ContentStatus,
} from "@/lib/content-posts";
import { LISTINGS, getBrand } from "@/lib/mock-data";

export const Route = createFileRoute("/marketing/content")({
  component: guarded("emails", "Content calendar", ContentCalendarPage),
});

const STATUS_STYLE: Record<ContentStatus, string> = {
  Published: "bg-emerald-500/10 text-emerald-600",
  Approve: "bg-blue-500/10 text-blue-600",
  Reviewing: "bg-red-500/10 text-red-600",
  Drafting: "bg-amber-500/10 text-amber-700",
  "Needs correction": "bg-purple-500/10 text-purple-600",
  "Not Started": "bg-muted text-muted-foreground",
};

function listingName(id: string): string {
  const l = LISTINGS.find((x) => x.id === id);
  if (!l) return id;
  return `${getBrand(l.brandId)?.name ?? ""} ${l.model}`.trim();
}

function ContentCalendarPage() {
  const posts = allPosts();
  const [onlyLinked, setOnlyLinked] = useState(false);

  const rows = useMemo(
    () => posts.map((p) => ({ post: p, listingId: resolveListingId(p) }))
      .filter((r) => !onlyLinked || r.listingId),
    [posts, onlyLinked],
  );
  const linkedCount = posts.filter((p) => resolveListingId(p)).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Marketing"
        title="Content calendar"
        subtitle={`${posts.length} posts · ${linkedCount} linked to listings`}
        actions={
          <a href={CONTENT_CALENDAR_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-accent">
            <ExternalLink className="h-4 w-4 text-muted-foreground" /> Open in Notion
          </a>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Synced from Notion · {formatDateTime(CONTENT_SYNCED_AT)}
          </span>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--brand))]" />
            Linked to a listing only
          </label>
        </div>

        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Post</th>
                <th className="px-3 py-2 font-semibold">Listing</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Accounts / channels</th>
                <th className="px-3 py-2 font-semibold">Due</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ post: p, listingId }) => {
                const accounts = [...new Set(p.channels.map(channelAccount))];
                return (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <a href={p.notionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-brand hover:underline">
                        {p.taskName} <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                      {p.dealer && <div className="text-xs text-muted-foreground">{p.dealer}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {listingId ? (
                        <Link to="/listings/$id" params={{ id: listingId }} className="inline-flex items-center gap-1 text-brand hover:underline">
                          <Boxes className="h-3.5 w-3.5" /> {listingName(listingId)}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {p.type.map((t) => <span key={t} className="rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-deep">{t}</span>)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">{accounts.join(", ")}</div>
                      {p.channels.join(", ")}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{formatDate(p.dueDate)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppShell>
  );
}
