import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft, DollarSign } from "lucide-react";

export function PageHeader({
  eyebrow,
  media,
  title,
  subtitle,
  actions,
  creditAnchor,
}: {
  eyebrow?: ReactNode;
  media?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  creditAnchor?: {
    onClick: () => void;
    label?: string;
  };
}) {
  const router = useRouter();

  const goBack = () => {
    // Prefer real browser history so users land back where they came from.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <div className="border-b border-border bg-surface px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {media && <div className="shrink-0 pt-0.5">{media}</div>}
          <div className="min-w-0">
            {eyebrow && (
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Go back"
                  className="-ml-1 flex items-center rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-brand"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span>{eyebrow}</span>
              </div>
            )}
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-brand-deep">{title}</h1>
              {creditAnchor && (
                <button
                  type="button"
                  onClick={creditAnchor.onClick}
                  aria-label={creditAnchor.label ?? "YachtWay credit on file"}
                  title={creditAnchor.label ?? "YachtWay credit on file"}
                  className="relative grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <DollarSign className="h-3 w-3" />
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
                </button>
              )}
            </div>
            {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">{actions}</div>}
      </div>
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-6 py-5">{children}</div>;
}
