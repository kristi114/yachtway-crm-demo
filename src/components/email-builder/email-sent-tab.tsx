import { formatDateTime } from "@/lib/format-date";
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mail, Plus } from "lucide-react";

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
import { useSentLog, type SentEmail } from "@/lib/email-send";

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
  return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Sent</Badge>;
}

export function EmailSentTab() {
  const log = useSentLog();
  const navigate = useNavigate();
  const sent = useMemo(() => [...log].sort((a, b) => b.sentAt.localeCompare(a.sentAt)), [log]);

  if (sent.length === 0) {
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
  );
}
