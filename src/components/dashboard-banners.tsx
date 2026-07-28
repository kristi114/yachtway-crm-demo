import { Link } from "@tanstack/react-router";
import { Bell, X, ArrowRight } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useNotifications, bannersForUser, dismissNotification } from "@/lib/notifications";

/**
 * Home-dashboard banner strip. Renders the current user's active banner
 * notifications (e.g. the paid-seat automation alert). Dismissible.
 */
export function DashboardBanners() {
  const { user } = useAuth();
  const all = useNotifications();
  const banners = bannersForUser(all, user);
  if (banners.length === 0) return null;

  return (
    <div className="mt-6 space-y-2">
      {banners.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-3 rounded-sm border border-brand/30 bg-brand/5 px-4 py-3 shadow-sm"
        >
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-brand-deep">{n.title}</span>
              {n.emailed && (
                <span className="rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-deep">
                  Emailed you
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
            {n.link && (
              <Link
                to={n.link.to}
                params={n.link.params as never}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                {n.link.label} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissNotification(n.id)}
            title="Dismiss"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
