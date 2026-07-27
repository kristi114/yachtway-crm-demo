import { Phone, Mail, MessageSquare, Clock, ThumbsUp, ThumbsDown, AlertTriangle } from "lucide-react";

// ==========================================================
// Mock activity + coaching data per rep. Admin-only view.
// Numbers are last-30-day rolling.
// ==========================================================
type RepActivity = {
  calls: number;
  emails: number;
  messages: number;
  meetings: number;
  callsTrend: number;   // % vs prior 30d
  emailsTrend: number;
  messagesTrend: number;
  avgResponseMins: number;   // to inbound user messages
  responseTrend: number;     // negative = getting faster (good)
  pitched: string[];
  notPitched: string[];
  weaknesses: string[];
};

const ACTIVITY: Record<string, RepActivity> = {
  // Mavil - US sales rep
  u_rep: {
    calls: 142, emails: 318, messages: 96, meetings: 22,
    callsTrend: 12, emailsTrend: -4, messagesTrend: 28,
    avgResponseMins: 46, responseTrend: -18,
    pitched: ["Custom Website", "Studio Photos", "CRM Seats"],
    notPitched: ["Fintech / Payments", "Listing Syndication", "Video Walkthroughs"],
    weaknesses: [
      "Skips discovery on deals under $10k - lower close rate",
      "Rarely loops in Fintech on qualifying calls",
    ],
  },
  // Debbie - fintech
  u_fin: {
    calls: 88, emails: 214, messages: 61, meetings: 18,
    callsTrend: -6, emailsTrend: 9, messagesTrend: 4,
    avgResponseMins: 32, responseTrend: -5,
    pitched: ["Payments", "Escrow", "Multi-currency"],
    notPitched: ["Custom Website", "Studio Photos"],
    weaknesses: [
      "Follow-up cadence drops after week 2",
      "Under-quotes onboarding time - deals slip",
    ],
  },
  // Sophie Laurent - EU rep
  u_rep_eu: {
    calls: 176, emails: 402, messages: 133, meetings: 27,
    callsTrend: 22, emailsTrend: 15, messagesTrend: 18,
    avgResponseMins: 21, responseTrend: -32,
    pitched: ["Custom Website", "CRM Seats", "Listing Syndication", "Video Walkthroughs"],
    notPitched: ["Fintech / Payments"],
    weaknesses: [
      "Discounts too early to close the quarter",
      "Rarely re-engages accounts after a 'not now'",
    ],
  },
  // Oliver Whitfield - UK rep
  u_rep_uk: {
    calls: 61, emails: 189, messages: 42, meetings: 11,
    callsTrend: -18, emailsTrend: -9, messagesTrend: -12,
    avgResponseMins: 94, responseTrend: 24,
    pitched: ["CRM Seats", "Studio Photos"],
    notPitched: ["Custom Website", "Fintech / Payments", "Listing Syndication", "Video Walkthroughs"],
    weaknesses: [
      "Response time trending up - inbound leads going cold",
      "Low outbound volume vs. team average",
      "Not pitching flagship Custom Website to any active accounts",
    ],
  },
};

export function RepActivityPanel({ userId }: { userId: string }) {
  const a = ACTIVITY[userId];
  if (!a) return null;

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Effort & coaching · last 30 days
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ActivityStat icon={Phone} label="Calls" value={a.calls} trend={a.callsTrend} />
        <ActivityStat icon={Mail} label="Emails" value={a.emails} trend={a.emailsTrend} />
        <ActivityStat icon={MessageSquare} label="Messages" value={a.messages} trend={a.messagesTrend} />
        <ActivityStat icon={Clock} label="Meetings" value={a.meetings} />
        <ActivityStat
          icon={Clock}
          label="Avg response"
          value={a.avgResponseMins < 60 ? `${a.avgResponseMins}m` : `${(a.avgResponseMins / 60).toFixed(1)}h`}
          trend={a.responseTrend}
          invertTrend
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <PitchList
          icon={ThumbsUp}
          tone="success"
          title="Actively pitching"
          items={a.pitched}
        />
        <PitchList
          icon={ThumbsDown}
          tone="muted"
          title="Not pitching"
          items={a.notPitched}
        />
        <PitchList
          icon={AlertTriangle}
          tone="warning"
          title="Weaknesses to coach"
          items={a.weaknesses}
        />
      </div>
    </div>
  );
}

function ActivityStat({
  icon: Icon, label, value, trend, invertTrend,
}: {
  icon: typeof Phone;
  label: string;
  value: number | string;
  trend?: number;
  invertTrend?: boolean;
}) {
  // For response time, negative trend (faster) is good.
  const isGood = trend === undefined ? null : invertTrend ? trend < 0 : trend > 0;
  const trendClass =
    isGood === null ? "text-muted-foreground"
    : isGood ? "text-success" : "text-destructive";
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-brand-deep">{value}</div>
      {trend !== undefined && (
        <div className={`text-[11px] font-medium tabular-nums ${trendClass}`}>
          {trend > 0 ? "+" : ""}{trend}% vs prior 30d
        </div>
      )}
    </div>
  );
}

function PitchList({
  icon: Icon, tone, title, items,
}: {
  icon: typeof ThumbsUp;
  tone: "success" | "muted" | "warning";
  title: string;
  items: string[];
}) {
  const toneClass =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : "text-muted-foreground";
  const bgClass =
    tone === "success" ? "bg-success/10"
    : tone === "warning" ? "bg-warning/10"
    : "bg-secondary/60";
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${toneClass}`}>
        <span className={`grid h-6 w-6 place-items-center rounded-full ${bgClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nothing to show.</div>
      ) : (
        <ul className="space-y-1 text-xs text-brand-deep">
          {items.map((it) => (
            <li key={it} className="flex gap-1.5">
              <span className="text-muted-foreground">•</span>
              <span className="leading-snug">{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
