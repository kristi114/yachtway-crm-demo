import { formatDateTime } from "@/lib/format-date";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Mail, Users, Info, ChevronDown, ChevronRight, Search } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getSentEmail, abWinner, type SentEmail } from "@/lib/email-send";
import { buildRecipientRows, type RecipientStatus } from "@/lib/email-recipients";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const STATUS_STYLES: Record<RecipientStatus, string> = {
  Clicked: "bg-purple-500/10 text-purple-600 hover:bg-purple-500/10",
  Opened: "bg-blue-500/10 text-blue-600 hover:bg-blue-500/10",
  Delivered: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10",
  Bounced: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
};

export const Route = createFileRoute("/emails/sent/$id")({
  component: guarded("emails", "Email Marketing", SentReportPage),
});

function pct(n: number | undefined, d: number | undefined): string {
  if (!n || !d) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label} <Info className="h-3 w-3 opacity-60" />
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

/** Simple Delivered → Opened → Clicked funnel bar. */
function Funnel({ s }: { s: SentEmail }) {
  const base = s.delivered ?? s.recipientCount ?? 0;
  if (!base) return null;
  const stages = [
    { label: "Delivered", value: s.delivered ?? base, color: "#4f7bf5" },
    { label: "Opened", value: s.opened ?? 0, color: "#7c9cf8" },
    { label: "Clicked", value: s.clicked ?? 0, color: "#a855f7" },
  ];
  return (
    <div className="space-y-2">
      {stages.map((st) => (
        <div key={st.label} className="flex items-center gap-3">
          <div className="w-20 shrink-0 text-sm text-muted-foreground">{st.label}</div>
          <div className="h-6 flex-1 overflow-hidden rounded bg-muted/50">
            <div
              className="h-full rounded"
              style={{ width: `${Math.max(2, (st.value / base) * 100)}%`, background: st.color }}
            />
          </div>
          <div className="w-28 shrink-0 text-right text-sm">
            {st.value.toLocaleString()} <span className="text-muted-foreground">({pct(st.value, base)})</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_FILTERS: (RecipientStatus | "All")[] = ["All", "Delivered", "Opened", "Clicked", "Bounced"];

function RecipientList({ email }: { email: SentEmail }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RecipientStatus | "All">("All");

  const { rows, total, shown } = useMemo(() => buildRecipientRows(email), [email]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "All" && r.status !== filter) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {open ? "Hide recipients" : `View individual recipients (${total.toLocaleString()})`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or email"
                className="h-8 pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    filter === f
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No matching recipients.</div>
            ) : (
              filtered.map((r) => {
                const inner = (
                  <>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
                        {initialsOf(r.name)}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`truncate text-sm font-medium ${r.contactId ? "text-brand" : ""}`}
                        >
                          {r.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                      {r.contactId && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </>
                );
                const cls =
                  "flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0";
                return r.contactId ? (
                  <Link
                    key={r.id}
                    to="/contacts/$id"
                    params={{ id: r.contactId }}
                    className={`${cls} transition-colors hover:bg-accent`}
                    title={`Open ${r.name}'s contact record`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={r.id} className={cls}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filtered.length.toLocaleString()}
            {filter === "All" && !q ? ` of ${total.toLocaleString()}` : ` matching`} recipient
            {filtered.length === 1 ? "" : "s"}
            {shown < total ? ` · sample of the first ${shown.toLocaleString()} for this mock` : ""}.
            Wire Mailgun events in apps/api for the complete per-recipient list.
          </p>
        </div>
      )}
    </div>
  );
}

function SentReportPage() {
  const { id } = Route.useParams();
  const email = useMemo(() => getSentEmail(id), [id]);

  if (!email) {
    return (
      <AppShell>
        <PageBody>
          <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Send not found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This send may have been cleared from the local log.
            </p>
            <Link to="/emails" className="mt-4 inline-block text-sm text-brand hover:underline">
              ← Back to Email Marketing
            </Link>
          </div>
        </PageBody>
      </AppShell>
    );
  }

  const recipients = email.recipientCount ?? email.to.length;
  const sentAt = formatDateTime(email.sentAt);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Email Marketing · Sent"
        title={email.subject || "(no subject)"}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
              {email.status === "sent" ? "Sent" : email.status}
            </Badge>
            <span>Sent {sentAt}</span>
            {email.providerName && (
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                via {email.providerName}
              </span>
            )}
            {email.mock && (
              <span className="text-[10px] uppercase text-muted-foreground">mock send</span>
            )}
          </span>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(360px,600px)]">
          {/* Left: report */}
          <div className="space-y-6">
            {/* Recipients + from */}
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-brand" /> Recipients
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Sent to</div>
                  <div className="mt-0.5 text-sm">
                    {recipients > 1 ? `${recipients.toLocaleString()} recipients` : email.to.join(", ")}
                  </div>
                  {recipients > 1 && email.to.length > 0 && (
                    <div className="mt-0.5 text-xs text-muted-foreground">List: {email.to.join(", ")}</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">From</div>
                  <div className="mt-0.5 text-sm">{email.from}</div>
                </div>
              </div>

              <RecipientList email={email} />
            </div>

            {/* Metrics */}
            <div>
              <h2 className="mb-3 text-sm font-semibold">Per-send report</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="Recipients" value={recipients} />
                <Metric label="Delivered" value={email.delivered ?? "—"} />
                <Metric label="Opened" value={email.opened ?? "—"} />
                <Metric label="Clicked" value={email.clicked ?? "—"} />
                <Metric label="Open rate" value={pct(email.opened, email.delivered)} />
                <Metric label="Click rate" value={pct(email.clicked, email.delivered)} />
              </div>
            </div>

            {/* A/B test results */}
            {email.abTest && (
              <div className="rounded-lg border border-border bg-surface p-5">
                <h2 className="mb-1 text-sm font-semibold">A/B test</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  {100 - email.abTest.splitPercentB}% / {email.abTest.splitPercentB}% split · winner by{" "}
                  {email.abTest.winnerMetric === "click" ? "click" : "open"} rate
                </p>
                {(() => {
                  const winner = abWinner(email);
                  const metric = email.abTest!.winnerMetric;
                  return (
                    <div className="space-y-2">
                      {email.abTest!.variants.map((v) => {
                        const base = v.delivered || v.recipients;
                        const hits = metric === "click" ? v.clicked : v.opened;
                        const rate = base ? (hits / base) * 100 : 0;
                        const won = winner?.label === v.label;
                        return (
                          <div
                            key={v.label}
                            className={`rounded-md border px-3 py-2.5 ${
                              won ? "border-success/40 bg-success/5" : "border-border bg-secondary/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="rounded-sm bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold text-brand-deep">
                                {v.label}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.subject}</span>
                              {won && (
                                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-success">
                                  Winner
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                              <span>{v.recipients} sent</span>
                              <span>{v.delivered} delivered</span>
                              <span>{v.opened} opened</span>
                              <span>{v.clicked} clicked</span>
                              <span className="font-semibold text-foreground">
                                {rate.toFixed(1)}% {metric} rate
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {!winner && (
                        <p className="text-xs text-muted-foreground">
                          Too close to call — both variants performed identically on this metric.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Non-opener follow-up */}
            {(email.followUp || email.followUpOf) && (
              <div className="rounded-lg border border-border bg-surface p-5">
                <h2 className="mb-2 text-sm font-semibold">Non-opener follow-up</h2>
                {email.followUpOf ? (
                  <p className="text-xs text-muted-foreground">
                    This send <span className="font-medium text-foreground">is</span> the follow-up to{" "}
                    <Link
                      to="/emails/sent/$id"
                      params={{ id: email.followUpOf }}
                      className="font-medium text-brand hover:underline"
                    >
                      the original campaign
                    </Link>
                    .
                  </p>
                ) : email.followUp?.sentId ? (
                  <p className="text-xs text-muted-foreground">
                    Sent {email.followUp.delayDays}d later with subject “{email.followUp.subject}”.{" "}
                    <Link
                      to="/emails/sent/$id"
                      params={{ id: email.followUp.sentId }}
                      className="font-medium text-brand hover:underline"
                    >
                      View follow-up
                    </Link>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Scheduled for {formatDateTime(email.followUp!.dueAt)} — will go to everyone
                    delivered but not opened, with subject “{email.followUp!.subject}”.
                  </p>
                )}
              </div>
            )}

            {/* Funnel */}
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Engagement funnel</h2>
              <Funnel s={email} />
              {email.opened == null && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Open/click tracking isn't populated for this send in the mock. Wire the Mailgun
                  event webhooks (apps/api) to see live engagement here.
                </p>
              )}
            </div>
          </div>

          {/* Right: the actual email */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Email</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="space-y-2 border-b border-border px-4 py-2.5">
                <div>
                  <div className="text-xs text-muted-foreground">Subject</div>
                  <div className="text-sm font-medium">{email.subject || "(no subject)"}</div>
                </div>
                {email.preheader && (
                  <div>
                    <div className="text-xs text-muted-foreground">Pre-header</div>
                    <div className="text-sm">{email.preheader}</div>
                  </div>
                )}
                {email.scheduleLabel && (
                  <div>
                    <div className="text-xs text-muted-foreground">Schedule</div>
                    <div className="text-sm">{email.scheduleLabel}</div>
                  </div>
                )}
                {(email.senderName || email.senderEmail || email.replyTo) && (
                  <div>
                    <div className="text-xs text-muted-foreground">Sender</div>
                    <div className="text-sm">
                      {email.senderName} {email.senderEmail && `<${email.senderEmail}>`}
                      {email.replyTo && (
                        <span className="text-muted-foreground"> · reply-to {email.replyTo}</span>
                      )}
                    </div>
                  </div>
                )}
                {email.options && (
                  <div className="flex flex-wrap gap-1.5">
                    {email.options.trackClicks && (
                      <Badge variant="outline" className="text-[10px]">Click tracking</Badge>
                    )}
                    {email.options.utmTracking && (
                      <Badge variant="outline" className="text-[10px]">UTM tagging</Badge>
                    )}
                    {email.options.preferenceType && (
                      <Badge variant="outline" className="text-[10px]">
                        {email.options.preferenceType}
                      </Badge>
                    )}
                  </div>
                )}
                {email.attachments?.length ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Attachments</div>
                    <div className="text-sm">{email.attachments.join(", ")}</div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {email.kind && (
                    <Badge variant="outline" className="text-[10px] capitalize">{email.kind}</Badge>
                  )}
                  {email.providerName && (
                    <span>
                      via {email.providerName}
                      {email.providerOverridden && (
                        <span className="ml-1 text-warning">(override)</span>
                      )}
                    </span>
                  )}
                  {email.title && email.title !== email.subject && (
                    <span>· Title: {email.title}</span>
                  )}
                </div>
              </div>
              <div className="bg-[#f4f5f7] p-3">
                {email.html ? (
                  <iframe
                    title="Sent email"
                    sandbox="allow-same-origin"
                    className="h-[640px] w-full rounded border border-border bg-white"
                    srcDoc={email.html}
                  />
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    The HTML body wasn't stored for this send.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </PageBody>
    </AppShell>
  );
}
