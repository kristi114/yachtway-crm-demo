import { useMemo } from "react";
import { Lightbulb, AlertTriangle, TrendingUp, Users, Video, LogIn, Clock, Sparkles, ArrowRight } from "lucide-react";
import { HandshakeIcon } from "@/components/icons/handshake-icon";
import { BoatIcon } from "@/components/icons/boat-icon";
import {
  computeDealerScore, has3DTours, daysSince,
  type Company, type Contact, type Listing, type ServiceKey,
} from "@/lib/mock-data";
import { computeListingHeat } from "@/components/dealer-health-panel";
import { getBrand } from "@/lib/mock-data";

type Priority = "high" | "medium" | "low";

interface Recommendation {
  id: string;
  priority: Priority;
  category: "Health" | "Listings" | "Engagement" | "Upsell";
  title: string;
  detail: string;
  action: string;
  icon: typeof Lightbulb;
  jumpTo?: string;
}

const PRIORITY_STYLES: Record<Priority, { chip: string; dot: string; label: string }> = {
  high:   { chip: "bg-destructive/10 text-destructive ring-destructive/30", dot: "bg-destructive", label: "High" },
  medium: { chip: "bg-warning/10 text-warning ring-warning/30",             dot: "bg-warning",     label: "Medium" },
  low:    { chip: "bg-brand/10 text-brand-deep ring-brand/30",              dot: "bg-brand",       label: "Low" },
};

const CATEGORY_ICON: Record<Recommendation["category"], typeof Lightbulb> = {
  Health:     AlertTriangle,
  Listings:   BoatIcon,
  Engagement: Users,
  Upsell:     Sparkles,
};

// Map dealer health reason labels to concrete rep actions.
function actionForHealthReason(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("portal"))          return "Send a portal walkthrough invite and schedule a 15-min onboarding call.";
  if (l.includes("studio"))          return "Book a Studio session - reshoot a hero listing to reset the streak.";
  if (l.includes("broker coverage")) return "Pull the scraped-broker gap list under People and invite the missing brokers to YachtWay.";
  if (l.includes("no listings"))     return "Kick off inventory sync with the dealer's ops contact.";
  if (l.includes("no active"))       return "Reactivate stale listings or coach the broker on relisting flow.";
  if (l.includes("3d tours"))        return "Pitch the 3D Tour bundle - 2-week trial on their top 3 hulls.";
  return "Flag on the next 1:1 with this account.";
}

function priorityFromWeight(w: number): Priority {
  const abs = Math.abs(w);
  if (abs >= 15) return "high";
  if (abs >= 8)  return "medium";
  return "low";
}

export function RecommendationsPanel({
  company, contacts, listings,
}: {
  company: Company;
  contacts: Contact[];
  listings: Listing[];
}) {
  const recs = useMemo<Recommendation[]>(() => {
    const out: Recommendation[] = [];

    // 1) Dealer health score reasons
    const score = computeDealerScore(company);
    score.reasons.forEach((r, i) => {
      out.push({
        id: `health-${i}`,
        priority: priorityFromWeight(r.weight),
        category: "Health",
        title: r.label,
        detail: `Dragging health score by ${r.weight} pts.`,
        action: actionForHealthReason(r.label),
        icon: AlertTriangle,
      });
    });

    // 2) Listing heat - surface the worst issues per vessel
    listings.forEach((l) => {
      const heat = computeListingHeat(l);
      const brand = getBrand(l.brandId);
      const vessel = `${brand?.name ?? ""} ${l.model}`.trim();
      heat.reasons.slice(0, 2).forEach((r, i) => {
        if (!r.action) return;
        out.push({
          id: `listing-${l.id}-${i}`,
          priority: priorityFromWeight(r.weight),
          category: "Listings",
          title: `${vessel} · ${r.label}`,
          detail: `${l.year} · ${l.lengthFt}ft · heat ${heat.score}/100. ${r.weight} pts on this listing.`,
          action: r.action,
          icon: r.icon,
        });
      });
    });

    // 3) Engagement gaps
    const lastTouchDays = daysSince(company.lastContactedAt);
    if (!company.lastContactedAt) {
      out.push({
        id: "eng-lasttouch",
        priority: "high", category: "Engagement",
        title: "No recorded touch on this account",
        detail: "There is no logged call, email, or meeting.",
        action: "Log an activity today to reset the cadence - even a 5-min check-in call counts.",
        icon: Clock,
      });
    } else if (lastTouchDays > 30) {
      out.push({
        id: "eng-lasttouch",
        priority: lastTouchDays > 60 ? "high" : "medium",
        category: "Engagement",
        title: `Last touch ${lastTouchDays}d ago`,
        detail: `Via ${company.lastContactChannel || "unknown channel"}.`,
        action: "Send a short check-in and offer a Studio slot or 3D tour audit.",
        icon: Clock,
      });
    }

    if (!company.lastLogin) {
      out.push({
        id: "eng-portal",
        priority: "medium", category: "Engagement",
        title: "Never signed into YachtWay portal",
        detail: "Adoption is zero - they cannot self-serve leads or Studio.",
        action: "Walk the main broker through login and lead inbox on the next call.",
        icon: LogIn,
      });
    }

    // 4) Upsell opportunities - services not yet used
    const notUsed = (Object.entries(company.servicesUsed) as [ServiceKey, boolean][])
      .filter(([, v]) => !v).map(([k]) => k);

    if (notUsed.includes("easyfund")) {
      out.push({
        id: "up-easyfund",
        priority: "medium", category: "Upsell",
        title: "EasyFund not activated",
        detail: "Financing referrals unlock rev-share on every funded deal.",
        action: "Send the EasyFund one-pager and offer to co-present to their sales floor.",
        icon: HandshakeIcon,
      });
    }
    if (notUsed.includes("live")) {
      out.push({
        id: "up-live",
        priority: "low", category: "Upsell",
        title: "YachtWay Live not activated",
        detail: "Live streaming drives 3x inquiry rate on hero units.",
        action: "Pitch a free Live session on their next boat show or new arrival.",
        icon: Video,
      });
    }

    // 3D tour coverage
    const tours = has3DTours(company);
    if (tours.total > 0 && tours.with3d / tours.total < 0.3) {
      out.push({
        id: "up-3d",
        priority: "medium", category: "Upsell",
        title: `Only ${tours.with3d}/${tours.total} listings have 3D tours`,
        detail: "3D coverage is the #1 lift on time-on-page and qualified inquiries.",
        action: "Bundle 5 tours at intro pricing - start with the highest-price hulls.",
        icon: Sparkles,
      });
    }

    // Sort: high → medium → low, keep insertion order within a bucket
    const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
  }, [company, contacts, listings]);

  const counts = {
    high:   recs.filter((r) => r.priority === "high").length,
    medium: recs.filter((r) => r.priority === "medium").length,
    low:    recs.filter((r) => r.priority === "low").length,
  };

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-gradient-to-r from-brand/10 to-transparent px-4 py-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-wide text-brand-deep">
          <Lightbulb className="h-4 w-4 text-brand" />
          Recommendations for this account
        </h3>
        <div className="flex items-center gap-2 text-[15px] tabular-nums">
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <span
              key={p}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset ${PRIORITY_STYLES[p].chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_STYLES[p].dot}`} />
              {counts[p]} {PRIORITY_STYLES[p].label.toLowerCase()}
            </span>
          ))}
        </div>
      </header>

      {recs.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 text-[15px] text-muted-foreground">
          <TrendingUp className="h-5 w-5 text-success" />
          This account has no open recommendations - keep the cadence steady.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {recs.map((r) => {
            const p = PRIORITY_STYLES[r.priority];
            const CatIcon = CATEGORY_ICON[r.category];
            const Icon = r.icon;
            return (
              <li key={r.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3">
                <div className="mt-0.5 flex flex-col items-center gap-1">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${p.chip} ring-1 ring-inset`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-secondary-foreground`}>
                    <CatIcon className="h-3 w-3" />
                    {r.category}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[13px] font-semibold ring-1 ring-inset ${p.chip}`}>
                      {p.label}
                    </span>
                  </div>
                  <div className="mt-1 text-[15px] text-foreground">{r.detail}</div>
                  <div className="mt-2 flex items-start gap-2 rounded-sm bg-secondary/40 px-3 py-2 text-[15px]">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span className="text-foreground">{r.action}</span>
                  </div>
                </div>
                <span className="hidden text-[13px] text-muted-foreground sm:block">
                  {/* reserved for future 'Dismiss' or 'Log activity' actions */}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-border bg-secondary/30 px-4 py-2.5 text-[15px] text-secondary-foreground">
        Aggregated from dealer health, listing heat scores, engagement gaps, and unused services.
      </div>
    </section>
  );
}
