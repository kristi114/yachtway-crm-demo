import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { format } from "date-fns";
import { Send, ThumbsUp, Users, MousePointerClick, MessageCircle, TrendingUp, Check, Download } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { DateRangePicker, rangeDays, previousRange, type RangeValue } from "@/components/date-range-picker";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  CHANNELS, ACCOUNTS, channelStatsFor, dailyFor, dailyForChannel, topPostsFor, demographyFor,
  totalsFor, compact, channelColor, channelName, type ChannelId, type ChannelStats,
} from "@/lib/social-stats";

const fmtDate = (d: Date) => format(d, "MMM d, yyyy");

/** Build a CSV of the current per-channel view and trigger a download. */
function exportCsv(
  stats: Record<ChannelId, ChannelStats>,
  meta: { accounts: string; range: string; compare: string },
) {
  const header = ["Channel", "Posts", "Likes", "Comments", "Shares", "Impressions", "Reach", "Link clicks", "Followers"];
  const lines = CHANNELS.map((c) => {
    const s = stats[c.id];
    return [c.name, s.posts, s.likes, s.comments, s.shares, s.impressions, s.reach, s.linkClicks, s.followers].join(",");
  });
  const preamble = [
    `YachtWay social statistics`,
    `Accounts,${meta.accounts}`,
    `Period,${meta.range}`,
    `Compared to,${meta.compare}`,
    ``,
  ];
  const csv = [...preamble, header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `social-statistics-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/marketing/statistics")({
  component: guarded("emails", "Social statistics", SocialStatisticsPage),
});

function Trend({ pct }: { pct: number }) {
  if (!pct) return <span className="text-xs text-muted-foreground">0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-success" : "text-destructive"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function ChannelDot({ id }: { id: ChannelId }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: channelColor(id) }} />;
}

function Card({ title, children, subtitle }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

const KPIS = (t: ReturnType<typeof totalsFor>) => [
  { label: "Number of posts", value: String(t.posts), icon: Send },
  { label: "Total likes", value: compact(t.likes), icon: ThumbsUp },
  { label: "Total followers", value: String(t.followers), icon: Users },
  { label: "Total impressions", value: compact(t.impressions), icon: MousePointerClick },
  { label: "Total comments", value: String(t.comments), icon: MessageCircle },
];

function SocialStatisticsPage() {
  // Default: all accounts selected.
  const [accounts, setAccounts] = useState<string[]>(ACCOUNTS.map((a) => a.id));
  // Default period: Jul 21–27, 2026 (matches the seeded mock week).
  const [range, setRange] = useState<RangeValue>({ from: new Date(2026, 6, 21), to: new Date(2026, 6, 27) });
  const [channel, setChannel] = useState<ChannelId | "all">("all");
  const allOn = accounts.length === ACCOUNTS.length;
  const mult = rangeDays(range) / 7;
  const prev = previousRange(range);
  const rangeLabel = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const compareLabel = `vs ${fmtDate(prev.from)} – ${fmtDate(prev.to)}`;

  function toggleAccount(id: string) {
    setAccounts((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // Never allow an empty selection — fall back to all.
      return next.length === 0 ? ACCOUNTS.map((a) => a.id) : next;
    });
  }

  const stats = useMemo(() => channelStatsFor(accounts, mult), [accounts, mult]);
  const daily = useMemo(() => dailyFor(accounts, mult), [accounts, mult]);
  const topPosts = useMemo(() => topPostsFor(accounts), [accounts]);
  const demo = useMemo(() => demographyFor(accounts, mult), [accounts, mult]);
  const t = useMemo(() => totalsFor(stats), [stats]);
  const rows = CHANNELS.map((c) => ({ ...c, s: stats[c.id] }));
  const channelDaily = useMemo(
    () => (channel === "all" ? [] : dailyForChannel(accounts, channel, mult)),
    [accounts, channel, mult],
  );

  const selectedLabel = allOn
    ? "all accounts"
    : ACCOUNTS.filter((a) => accounts.includes(a.id)).map((a) => a.name).join(", ");

  // KPI values reflect the whole book or the drilled-in channel.
  const cs = channel === "all" ? null : stats[channel];
  const kpiTotals = cs
    ? { posts: cs.posts, likes: cs.likes, followers: cs.followers, impressions: cs.impressions, comments: cs.comments, reach: cs.reach }
    : t;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Marketing"
        title="Social statistics"
        subtitle={`${rangeLabel} ${compareLabel} · ${selectedLabel}`}
      />
      <PageBody>
        <div className="space-y-6">
          {/* Account filter + date range */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounts</span>
            <button
              type="button"
              onClick={() => setAccounts(ACCOUNTS.map((a) => a.id))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                allOn ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {allOn && <Check className="h-3.5 w-3.5" />} All
            </button>
            {ACCOUNTS.map((a) => {
              const on = !allOn && accounts.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAccount(a.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    on ? "border-brand bg-brand/10 text-brand-deep" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {on && <Check className="h-3.5 w-3.5" />} {a.name}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <DateRangePicker value={range} onChange={setRange} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Download className="h-4 w-4 text-muted-foreground" /> Export
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      exportCsv(stats, { accounts: selectedLabel, range: rangeLabel, compare: compareLabel })
                    }
                  >
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()}>
                    Export PDF (print)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Channel drill-down selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel</span>
            <button
              type="button"
              onClick={() => setChannel("all")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                channel === "all" ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All channels
            </button>
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  channel === c.id ? "border-brand bg-brand/10 text-brand-deep" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {KPIS(kpiTotals).map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <k.icon className="h-4 w-4 text-brand" /> {k.label}
                </div>
                <div className="mt-2 text-3xl font-semibold tabular-nums text-brand-deep">{k.value}</div>
              </div>
            ))}
          </div>

          {channel !== "all" && (
            <ChannelDetail
              channelId={channel}
              stats={stats[channel]}
              daily={channelDaily}
              topPosts={topPosts.filter((p) => p.channel === channel)}
              compareLabel={compareLabel}
            />
          )}

          {channel === "all" && (<>
          {/* Social post performance */}
          <Card title="Social post performance">
            <div className="h-[360px] px-2 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: "Number of Posts", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => compact(v)} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="facebookPosts" name="Facebook" stackId="p" fill={channelColor("facebook")} radius={[0, 0, 0, 0]} maxBarSize={36} />
                  <Bar yAxisId="left" dataKey="instagramPosts" name="Instagram" stackId="p" fill={channelColor("instagram")} radius={[3, 3, 0, 0]} maxBarSize={36} />
                  <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#E1306C" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="likes" name="Likes" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2 }} />
                  <Line yAxisId="right" type="monotone" dataKey="comments" name="Comments" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Per-channel breakdown tables */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChannelTable title="Number of posts" rows={rows} value={(s) => String(s.posts)} trend={(s) => s.postsTrendPct} valueHeader="Number of posts" />
            <ChannelTable
              title="Engagement"
              rows={rows}
              value={(s) => compact(s.likes)}
              trend={(s) => s.engagementTrendPct}
              valueHeader="Likes"
              extraCols={[
                { header: "Comments", cell: (s) => (s.comments ? String(s.comments) : "–") },
                { header: "Shares", cell: (s) => (s.shares ? compact(s.shares) : "–") },
              ]}
            />
          </div>

          {/* Impressions + reach */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GaugeCard title="Impressions" total={t.impressions} deltaPct={-19.84} compareLabel={compareLabel} rows={rows} value={(s) => (s.impressions ? compact(s.impressions) : "–")} trend={(s) => s.impressionsTrendPct} />
            <GaugeCard title="Post reach" total={t.reach} deltaPct={-40.22} compareLabel={compareLabel} rows={rows} value={(s) => (s.reach ? compact(s.reach) : "–")} trend={(s) => s.reachTrendPct} />
          </div>

          {/* Link clicks by socials */}
          <Card title="Link clicks by socials">
            <div className="space-y-2 p-4">
              {rows.map((r) => {
                const max = Math.max(1, ...rows.map((x) => x.s.linkClicks));
                const pct = (r.s.linkClicks / max) * 100;
                return (
                  <div key={r.id} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{r.name}</span>
                    <div className="h-6 overflow-hidden rounded-sm bg-secondary/60">
                      <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: r.color }} />
                    </div>
                    <span className="text-right tabular-nums">{r.s.linkClicks}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Top performing posts */}
          <Card title="Top performing posts">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Caption</th>
                    <th className="px-4 py-2 font-semibold">Likes</th>
                    <th className="px-4 py-2 font-semibold">Comments</th>
                    <th className="px-4 py-2 font-semibold">Shares</th>
                    <th className="px-4 py-2 font-semibold">Channel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topPosts.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-[520px] truncate px-4 py-2.5">{p.caption}</td>
                      <td className="px-4 py-2.5 tabular-nums">{compact(p.likes)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.comments}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.shares}</td>
                      <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><ChannelDot id={p.channel} /> {CHANNELS.find((c) => c.id === p.channel)?.name}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Demography */}
          <Card title="Audience demography" subtitle="Impressions by gender and age band">
            <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2">
              <div className="flex items-center gap-6">
                <div className="h-40 w-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: "Male", value: demo.gender.male }, { name: "Female", value: demo.gender.female }]} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                        <Cell fill="#7C6FF0" />
                        <Cell fill="#38BDF8" />
                      </Pie>
                      <Tooltip formatter={(v: number) => compact(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#7C6FF0" }} /> Male · {demo.gender.malePct}% · {compact(demo.gender.male)}</div>
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#38BDF8" }} /> Female · {demo.gender.femalePct}% · {compact(demo.gender.female)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {demo.ageBands.map((a) => (
                  <div key={a.label} className="rounded-md border border-border bg-secondary/40 px-3 py-2">
                    <div className="text-xs text-muted-foreground">{a.label}</div>
                    <div className="text-sm font-semibold tabular-nums">{compact(a.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          </>)}
        </div>
      </PageBody>
    </AppShell>
  );
}

/* ---------- Single-channel drill-down ---------- */
function ChannelDetail({
  channelId, stats, daily, topPosts, compareLabel,
}: {
  channelId: ChannelId;
  stats: ChannelStats;
  daily: import("@/lib/social-stats").ChannelDayPoint[];
  topPosts: import("@/lib/social-stats").TopPost[];
  compareLabel: string;
}) {
  const kpis = [
    { label: "Posts", value: String(stats.posts), trend: stats.postsTrendPct },
    { label: "Likes", value: compact(stats.likes), trend: stats.engagementTrendPct },
    { label: "Comments", value: stats.comments ? String(stats.comments) : "–" },
    { label: "Shares", value: stats.shares ? compact(stats.shares) : "–" },
    { label: "Impressions", value: compact(stats.impressions), trend: stats.impressionsTrendPct },
    { label: "Reach", value: compact(stats.reach), trend: stats.reachTrendPct },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: channelColor(channelId) }} />
        <h2 className="text-lg font-semibold">{channelName(channelId)}</h2>
        <span className="text-xs text-muted-foreground">{compareLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-brand-deep">{k.value}</div>
            {k.trend !== undefined && <div className="mt-1"><Trend pct={k.trend} /></div>}
          </div>
        ))}
      </div>

      <Card title={`${channelName(channelId)} · daily performance`}>
        <div className="h-[320px] px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: "Posts", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => compact(v)} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="posts" name="Posts" fill={channelColor(channelId)} radius={[3, 3, 0, 0]} maxBarSize={36} />
              <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#E1306C" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="likes" name="Likes" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="comments" name="Comments" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={`Top ${channelName(channelId)} posts`}>
        {topPosts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No posts for this channel in the selected accounts/period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">Caption</th>
                  <th className="px-4 py-2 font-semibold">Likes</th>
                  <th className="px-4 py-2 font-semibold">Comments</th>
                  <th className="px-4 py-2 font-semibold">Shares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topPosts.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-[560px] truncate px-4 py-2.5">{p.caption}</td>
                    <td className="px-4 py-2.5 tabular-nums">{compact(p.likes)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.comments}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Reusable per-channel table ---------- */
type Row = { id: ChannelId; name: string; color: string; s: ChannelStats };

function ChannelTable({
  title, rows, value, trend, valueHeader, extraCols = [],
}: {
  title: string;
  rows: Row[];
  value: (s: Row["s"]) => string;
  trend: (s: Row["s"]) => number;
  valueHeader: string;
  extraCols?: { header: string; cell: (s: Row["s"]) => string }[];
}) {
  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Socials</th>
              <th className="px-4 py-2 font-semibold">{valueHeader}</th>
              {extraCols.map((c) => <th key={c.header} className="px-4 py-2 font-semibold">{c.header}</th>)}
              <th className="px-4 py-2 font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><ChannelDot id={r.id} /> {r.name}</span></td>
                <td className="px-4 py-2.5 tabular-nums">{value(r.s)}</td>
                {extraCols.map((c) => <td key={c.header} className="px-4 py-2.5 tabular-nums">{c.cell(r.s)}</td>)}
                <td className="px-4 py-2.5"><Trend pct={trend(r.s)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- Gauge + table card (impressions / reach) ---------- */
function GaugeCard({
  title, total, deltaPct, compareLabel, rows, value, trend,
}: {
  title: string;
  total: number;
  deltaPct: number;
  compareLabel: string;
  rows: Row[];
  value: (s: Row["s"]) => string;
  trend: (s: Row["s"]) => number;
}) {
  return (
    <Card title={title}>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <TrendingUp className="h-5 w-5 text-brand" />
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title} count</div>
          <div className="text-3xl font-semibold tabular-nums text-brand-deep">{compact(total)}</div>
          <Trend pct={deltaPct} />
          <div className="text-[11px] text-muted-foreground">{compareLabel}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-2"><span className="inline-flex items-center gap-2"><ChannelDot id={r.id} /> {r.name}</span></td>
                  <td className="py-2 pr-2 tabular-nums">{value(r.s)}</td>
                  <td className="py-2 text-right"><Trend pct={trend(r.s)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
