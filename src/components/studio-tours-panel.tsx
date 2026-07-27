import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Video, Mail, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMoney } from "@/lib/auth";
import { getCompany } from "@/lib/mock-data";
import {
  STUDIO_REMINDER_WINDOW_DAYS,
  STUDIO_STORAGE_RENEWAL_PRICE_USD,
  ensureRenewalTasks,
  markRenewed,
  sendRenewalReminder,
  useStudioTours,
  type StudioTour,
} from "@/lib/studio-tours";

const STATUS_META: Record<
  StudioTour["status"],
  { label: string; className: string; icon: typeof Clock }
> = {
  active: {
    label: "Storage active",
    className: "bg-brand/10 text-brand-deep",
    icon: CheckCircle2,
  },
  expiring: {
    label: "Renewal due",
    className: "bg-warning/15 text-warning",
    icon: AlertTriangle,
  },
  expired: {
    label: "Expired",
    className: "bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  renewed: {
    label: "Renewed",
    className: "bg-brand/15 text-brand-deep",
    icon: CheckCircle2,
  },
};

interface Props {
  tours: StudioTour[];
  /** When true, hides the company column (used on the company profile). */
  hideCompany?: boolean;
  emptyLabel?: string;
}

export function StudioToursPanel({ tours, hideCompany, emptyLabel }: Props) {
  useStudioTours();
  const { format: fmtMoney } = useMoney();

  // Auto-raise the owner task once a tour is within 30 days of its annual mark.
  useEffect(() => {
    ensureRenewalTasks();
  }, [tours]);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-brand" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            3D Tour storage
          </h3>
        </div>
        <p className="text-[12px] text-muted-foreground">
          1 year included · {fmtMoney(STUDIO_STORAGE_RENEWAL_PRICE_USD)}/yr to renew ·
          auto-reminder + owner task {STUDIO_REMINDER_WINDOW_DAYS}d before expiry
        </p>
      </header>

      {tours.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted-foreground">
          {emptyLabel ?? "No delivered Studio tours yet. Records appear here once a Studio opportunity moves to Delivered / Completed."}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {tours.map((t) => {
            const meta = STATUS_META[t.status];
            const Icon = meta.icon;
            const co = t.companyId ? getCompany(t.companyId) : null;
            const currency = co?.currency;
            const remindDisabled = t.status === "renewed" || !!t.reminder_sent_at;
            const daysLabel =
              t.status === "renewed"
                ? `Renewed through ${t.renewed_until ?? t.expires_at}`
                : t.days_until_expiry < 0
                ? `Expired ${Math.abs(t.days_until_expiry)}d ago`
                : t.days_until_expiry === 0
                ? "Expires today"
                : `${t.days_until_expiry}d until expiry`;

            return (
              <li key={t.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/opportunities/$id"
                      params={{ id: t.id }}
                      className="text-[13px] font-medium text-brand hover:underline"
                    >
                      {t.opportunity.name}
                    </Link>
                    <span
                      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${meta.className}`}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    {!hideCompany && co && (
                      <Link
                        to="/companies/$id"
                        params={{ id: co.id }}
                        className="text-[12px] text-muted-foreground hover:text-brand hover:underline"
                      >
                        · {co.name}
                      </Link>
                    )}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Delivered {t.delivered_at} · Expires{" "}
                    <span className="font-medium text-foreground">{t.expires_at}</span> ·{" "}
                    {daysLabel}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Reminder scheduled: {t.reminder_at}
                    {t.reminder_sent_at && (
                      <span className="ml-1 text-brand-deep">
                        · sent {t.reminder_sent_at.slice(0, 10)}
                      </span>
                    )}
                    <span className="ml-2">
                      · Renewal {fmtMoney(t.renewal_price_usd, currency)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remindDisabled}
                    onClick={() => sendRenewalReminder(t.id)}
                    title={
                      t.reminder_sent_at
                        ? "Reminder already sent"
                        : "Email dealer + create internal task"
                    }
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    {t.reminder_sent_at ? "Reminder sent" : "Send renewal reminder"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={t.status === "renewed"}
                    onClick={() => markRenewed(t.id, 1)}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Mark renewed
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
