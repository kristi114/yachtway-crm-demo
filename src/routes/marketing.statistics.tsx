import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { Send, ThumbsUp, Users, MousePointerClick, MessageCircle, TrendingUp } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import {
  CHANNELS, CHANNEL_STATS, DAILY, TOP_POSTS, AGE_BANDS, GENDER,
  totals, compact, channelColor, type ChannelId,
} from "@/lib/social-stats";

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

const KPIS = (t: ReturnType<typeof totals>) => [
  { label: "Number of posts", value: String(t.posts), icon: Send },
  { label: "Total likes", value: compact(t.likes), icon: ThumbsUp },
  { label: "Total followers", value: String(t.followers), icon: Users },
  { label: "Total impressions", value: compact(t.impressions), icon: MousePointerClick },
  { label: "Total comments", value: String(t.comments), icon: MessageCircle },
];

function SocialStatisticsPage() {
  const t = useMemo(() => totals(), []);
  const rows = CHANNELS.map((c) => ({ ...c, s: CHANNEL_STATS[c.id] }));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Marketing"
        title="Social statistics"
        subtitle="Jul 21, 2026 – Jul 27, 2026 vs previous 7 days · all connected channels"
      />
      <PageBody>
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {KPIS(t).map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <k.icon className="h-4 w-4 text-brand" /> {k.label}
                </div>
                <div className="mt-2 text-3xl font-semibold tabular-nums text-brand-deep">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Social post performance */}
          <Card title="Social post performance">
            <div className="h-[360px] px-2 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={DAILY} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
            <GaugeCard title="Impressions" total={t.impressions} deltaPct={-19.84} rows={rows} value={(s) => (s.impressions ? compact(s.impressions) : "–")} trend={(s) => s.impressionsTrendPct} />
            <GaugeCard title="Post reach" total={t.reach} deltaPct={-40.22} rows={rows} value={(s) => (s.reach ? compact(s.reach) : "–")} trend={(s) => s.reachTrendPct} />
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
                  {TOP_POSTS.map((p) => (
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
                      <Pie data={[{ name: "Male", value: GENDER.male }, { name: "Female", value: GENDER.female }]} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                        <Cell fill="#7C6FF0" />
                        <Cell fill="#38BDF8" />
                      </Pie>
                      <Tooltip formatter={(v: number) => compact(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#7C6FF0" }} /> Male · {GENDER.malePct}% · {compact(GENDER.male)}</div>
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#38BDF8" }} /> Female · {GENDER.femalePct}% · {compact(GENDER.female)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {AGE_BANDS.map((a) => (
                  <div key={a.label} className="rounded-md border border-border bg-secondary/40 px-3 py-2">
                    <div className="text-xs text-muted-foreground">{a.label}</div>
                    <div className="text-sm font-semibold tabular-nums">{compact(a.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </PageBody>
    </AppShell>
  );
}

/* ---------- Reusable per-channel table ---------- */
type Row = { id: ChannelId; name: string; color: string; s: typeof CHANNEL_STATS[ChannelId] };

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
  title, total, deltaPct, rows, value, trend,
}: {
  title: string;
  total: number;
  deltaPct: number;
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
          <div className="text-[11px] text-muted-foreground">vs previous 7 days</div>
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
