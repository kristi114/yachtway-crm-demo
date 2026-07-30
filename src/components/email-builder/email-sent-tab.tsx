import { formatDateTime } from "@/lib/format-date";
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mail, Plus, CalendarClock, Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { newTemplateId } from "@/lib/email-templates";
import { useSentLog, cancelScheduledSend, type SentEmail } from "@/lib/email-send";

function when(iso: string): string {
  return formatDateTime(iso);
}

function recipients(s: SentEmail): string {
  if (s.recipientCount && s.recipientCount > 1) return `${s.recipientCount.toLocaleString()} recipients`;
  return s.to.join(", ");
}

function openRate(s: SentEmail): string {
  if (s.delivered && s.opened != null) return `${Math.round((s.opened / s.delivered) * 100)}%`;
  return "—";
}

function StatusBadge({ status }: { status: SentEmail["status"] }) {
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "sending") return <Badge variant="secondary">Sending…</Badge>;
  if (status === "scheduled") {
    return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10">Scheduled</Badge>;
  }
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Sent</Badge>;
}

export function EmailSentTab() {
  const log = useSentLog();
  const navigate = useNavigate();
  // Queued campaigns first (soonest due at the top), then history newest-first.
  const scheduled = useMemo(
    () => log.filter((s) => s.status === "scheduled").sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    [log],
  );
  const sent = useMemo(
    () => log.filter((s) => s.status !== "scheduled").sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [log],
  );

  if (sent.length === 0 && scheduled.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-surface p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Nothing sent yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a template and hit Send — your sends will show up here.
        </p>
        <Button
          className="mt-4"
          onClick={() => navigate({ to: "/emails/$id", params: { id: newTemplateId() } })}
        >
          <Plus className="h-4 w-4" /> New email
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Queued campaigns — not yet dispatched, still cancellable. */}
      {scheduled.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <header className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
            <CalendarClock className="h-4 w-4 text-brand" />
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
              Scheduled ({scheduled.length})
            </h3>
          </header>
          <ul className="divide-y divide-border">
            {scheduled.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/emails/sent/$id", params: { id: s.id } })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-brand hover:underline">
                    {s.subject || "(no subject)"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.scheduleLabel ?? `Due ${when(s.sentAt)}`}
                  </div>
                </button>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {recipients(s)}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {when(s.sentAt)}
                </span>
                <StatusBadge status={s.status} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Cancel "${s.subject || "this campaign"}"? It won't be sent.`)) {
                      cancelScheduledSend(s.id);
                    }
                  }}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Recipients</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="text-right">Delivered</TableHead>
            <TableHead className="text-right">Opens</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">Open rate</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sent.map((s) => (
            <TableRow
              key={s.id}
              className="cursor-pointer"
              onClick={() => navigate({ to: "/emails/sent/$id", params: { id: s.id } })}
            >
              <TableCell className="max-w-[280px]">
                <div className="truncate font-medium">{s.subject || "(no subject)"}</div>
                {s.templateName && (
                  <div className="truncate text-xs text-muted-foreground">{s.templateName}</div>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{recipients(s)}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {when(s.sentAt)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {s.delivered != null ? s.delivered.toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-right text-sm">
                {s.opened != null ? s.opened.toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-right text-sm">
                {s.clicked != null ? s.clicked.toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-right text-sm font-medium">{openRate(s)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {s.mock && <span className="text-[10px] uppercase text-muted-foreground">mock</span>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
