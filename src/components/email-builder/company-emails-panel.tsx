import { formatDateTime } from "@/lib/format-date";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { emailsForCompany, type RecipientStatus } from "@/lib/email-recipients";

const STATUS_STYLES: Record<RecipientStatus, string> = {
  Clicked: "bg-purple-500/10 text-purple-600 hover:bg-purple-500/10",
  Opened: "bg-blue-500/10 text-blue-600 hover:bg-blue-500/10",
  Delivered: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10",
  Bounced: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
};

/**
 * Company email roll-up: every email received by the company's contacts, minus
 * bulk marketing campaigns sent through Mailgun. Each row links to both the
 * send report and the contact it reached.
 */
export function CompanyEmailsPanel({ companyId }: { companyId: string }) {
  const received = useMemo(() => emailsForCompany(companyId), [companyId]);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Emails received ({received.length})
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Rolled up from all contacts. Excludes marketing emails sent through Mailgun.
        </p>
      </header>

      {received.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No tracked 1:1 emails to this company's contacts yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {received.map(({ send, status, contactId, contactName }) => (
            <li key={`${send.id}_${contactId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
              <Mail className="h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <Link to="/emails/sent/$id" params={{ id: send.id }} className="block truncate text-sm font-medium hover:underline">
                  {send.subject || "(no subject)"}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  To{" "}
                  <Link to="/contacts/$id" params={{ id: contactId }} className="text-brand hover:underline">
                    {contactName}
                  </Link>
                  {" · "}
                  {send.templateName ? `${send.templateName} · ` : ""}
                  {formatDateTime(send.sentAt)}
                </div>
              </div>
              <Badge className={STATUS_STYLES[status]}>{status}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
