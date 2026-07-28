import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { Download, Plus, ChevronsDown, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientOnly } from "@/components/client-only";
import { newTemplateId } from "@/lib/email-templates";
import {
  CAMPAIGN_OPTIONS,
  CAMPAIGN_TYPES,
  cumulativePct,
  engagementRows,
  getCampaignStats,
  openRatePct,
} from "@/lib/email-marketing";

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "danger";
}) {
  const valueColor =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        <Info className="h-3.5 w-3.5 opacity-60" />
      </div>
      <div className={`mt-2 text-3xl font-semibold tracking-tight ${valueColor}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

export function EmailStatisticsTab() {
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState("all");
  const [from, setFrom] = useState("2026-07-21");
  const [to, setTo] = useState("2026-07-27");

  const stats = useMemo(() => getCampaignStats(campaign), [campaign]);
  const rows = useMemo(() => engagementRows(stats), [stats]);
  const cumulative = useMemo(() => cumulativePct(stats), [stats]);
  const openRate = openRatePct(stats);

  function exportCsv() {
    const lines = [
      "Metric,Value",
      `Delivered,${stats.delivered}`,
      `Opened,${stats.opened}`,
      `Clicked,${stats.clicked}`,
      `Ordered,${stats.ordered}`,
      `Bounced,${stats.bounced}`,
      `Unsubscribed,${stats.unsubscribed}`,
      `Spam complaints,${stats.spam}`,
      `Open rate,${openRate}%`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-stats-${campaign}-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_OPTIONS.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 w-[130px] border-0 p-0 shadow-none focus-visible:ring-0"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 w-[130px] border-0 p-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={exportCsv} title="Export CSV">
            <Download className="h-4 w-4" />
          </Button>
          <Button onClick={() => navigate({ to: "/emails/$id", params: { id: newTemplateId() } })}>
            <Plus className="h-4 w-4" /> Create campaign
          </Button>
        </div>
      </div>

      {/* Engagement summary */}
      <section>
        <h2 className="text-lg font-semibold">Engagement summary</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Performance summary of recipient engagement, including open rates, click activity, and
          conversions.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <ClientOnly
                fallback={<div className="h-[360px] animate-pulse rounded bg-muted/40" />}
              >
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart layout="vertical" data={rows} margin={{ left: 12, right: 24 }}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tickFormatter={(v) => v.toLocaleString()} />
                    <YAxis type="category" dataKey="stage" width={72} />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Legend />
                    {CAMPAIGN_TYPES.map((t) => (
                      <Bar
                        key={t.key}
                        dataKey={t.key}
                        stackId="a"
                        fill={t.color}
                        name={t.label}
                        radius={t.key === "sequences" ? [0, 4, 4, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </div>
            {/* Cumulative funnel */}
            <div className="flex flex-row justify-around gap-2 lg:w-40 lg:flex-col">
              <div className="mb-1 hidden text-center text-xs font-medium text-muted-foreground lg:block">
                Cumulative
              </div>
              {(["Delivered", "Opened", "Clicked", "Ordered"] as const).map((stage, i) => (
                <div key={stage} className="flex flex-col items-center">
                  <div className="flex h-14 w-full min-w-[72px] items-center justify-center rounded-md bg-secondary/70 text-lg font-semibold">
                    {cumulative[stage]}%
                  </div>
                  {i < 3 && (
                    <ChevronsDown className="my-0.5 hidden h-4 w-4 text-muted-foreground/50 lg:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Performance analysis */}
      <section>
        <h2 className="text-lg font-semibold">Performance Analysis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track campaign performance trends for a metric over time.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Email Delivered" value={stats.delivered} />
          <StatCard label="Bounced" value={stats.bounced} tone="warn" />
          <StatCard label="Unsubscribed" value={stats.unsubscribed} />
          <StatCard label="Spam Complaints" value={stats.spam} tone="danger" />
        </div>
      </section>

      {/* Open rate */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Open Rate <span className="text-muted-foreground">(for {stats.name})</span>
          </h2>
        </div>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="lg:w-48">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Open Rate <Info className="h-3.5 w-3.5 opacity-60" />
            </div>
            <div className="mt-1 text-4xl font-semibold tracking-tight">{openRate}%</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.opened.toLocaleString()} of {stats.delivered.toLocaleString()} delivered
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <ClientOnly fallback={<div className="h-[200px] animate-pulse rounded bg-muted/40" />}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={stats.openRateTrend} margin={{ left: 4, right: 12, top: 8 }}>
                  <defs>
                    <linearGradient id="openRateFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f7bf5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f7bf5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" />
                  <YAxis unit="%" domain={[0, 40]} width={40} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#4f7bf5"
                    strokeWidth={2}
                    fill="url(#openRateFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        </div>
      </section>
    </div>
  );
}
