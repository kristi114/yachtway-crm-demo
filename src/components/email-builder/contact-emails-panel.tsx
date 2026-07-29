import { formatDateTime } from "@/lib/format-date";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { emailsForContact, type RecipientStatus } from "@/lib/email-recipients";
import { useSentLog } from "@/lib/email-send";
import type { EmailKind } from "@/lib/email-providers";

const STATUS_STYLES: Record<RecipientStatus, string> = {
  Clicked: "bg-purple-500/10 text-purple-600 hover:bg-purple-500/10",
  Opened: "bg-blue-500/10 text-blue-600 hover:bg-blue-500/10",
  Delivered: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10",
  Bounced: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
};

/** Kind → the provider it routed through + how we label the type chip. */
const KIND_META: Record<EmailKind, { label: string; provider: string; badge: string }> = {
  system: { label: "System", provider: "AWS SES", badge: "bg-slate-500/10 text-slate-600" },
  transactional: { label: "Transactional", provider: "Gmail", badge: "bg-brand/10 text-brand-deep" },
  marketing: { label: "Marketing", provider: "Mailgun", badge: "bg-fuchsia-500/10 text-fuchsia-700" },
};

type Segment = "all" | EmailKind;

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "All" },
  { id: "system", label: "System · AWS SES" },
  { id: "transactional", label: "Transactional · Gmail" },
  { id: "marketing", label: "Marketing · Mailgun" },
];

/** Normalize a send to its email kind (older seeds may only carry `marketing`). */
function kindOf(send: { kind?: EmailKind; marketing?: boolean }): EmailKind {
  return send.kind ?? (send.marketing ? "marketing" : "transactional");
}

function when(iso: string): string {
  return formatDateTime(iso);
}

export function ContactEmailsPanel({ contactId }: { contactId: string }) {
  useSentLog(); // re-render when new sends land
  const [segment, setSegment] = useState<Segment>("all");
  const received = useMemo(() => emailsForContact(contactId), [contactId]);

  // Counts per kind for the segment chips.
  const counts = useMemo(() => {
    const c: Record<Segment, number> = { all: received.length, system: 0, transactional: 0, marketing: 0 };
    for (const { send } of received) c[kindOf(send)] += 1;
    return c;
  }, [received]);

  const rows = segment === "all" ? received : received.filter(({ send }) => kindOf(send) === segment);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Emails ({counts.all}) · AWS SES + Gmail + Mailgun
        </h3>
      </header>

      {/* Type filter */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background/40 px-3 py-2.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
        {SEGMENTS.map((s) => {
          const active = segment === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {s.label}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  active ? "bg-brand-foreground/20" : "bg-background/70"
                }`}
              >
                {counts[s.id]}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No {segment === "all" ? "tracked" : SEGMENTS.find((s) => s.id === segment)?.label.split(" · ")[0].toLowerCase()} emails yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ send, status }) => {
            const meta = KIND_META[kindOf(send)];
            return (
              <li key={send.id}>
                <Link
                  to="/emails/sent/$id"
                  params={{ id: send.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                  title="Open the send report"
                >
                  <Mail className="h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{send.subject || "(no subject)"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {send.templateName ? `${send.templateName} · ` : ""}
                      {when(send.sentAt)}
                    </div>
                  </div>
                  <Badge className={`${meta.badge} hover:${meta.badge}`} title={`Sent via ${meta.provider}`}>
                    {meta.label}
                  </Badge>
                  <Badge className={STATUS_STYLES[status]}>{status}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
