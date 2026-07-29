import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlobalSearch, GlobalSearchTrigger } from "@/components/global-search";
import { Users, Building2, LayoutDashboard, Briefcase, Landmark, Wallet, MessageSquare, ShieldCheck, Search, ChevronDown, Lock, CheckSquare, Calendar, CalendarDays, Grid3x3, FileText, FileCheck2, FilePlus2, Receipt, PanelLeftClose, PanelLeftOpen, HandCoins, Mail, Banknote, Umbrella, Bell, BarChart3 } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";
import { DealerIcon } from "@/components/icons/dealer-icon";

import { YachtWayLogo } from "@/components/icons/yachtway-logo";

import { useAuth, ROLE_LABELS, canSeeFinTech, isPartnerRole, type Role } from "@/lib/auth";
import { SessionMenu } from "@/components/session-menu";
import { EmailSignatureDialog } from "@/components/email-signature-dialog";

import { usePermissions } from "@/lib/permissions";
import { ensureRenewalTasks } from "@/lib/studio-tours";
import { type CurrencyCode } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

import type { ResourceClass } from "@/lib/auth";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  gate: ResourceClass | null;
  stub?: boolean;
  search?: Record<string, string>;
  hiddenForRoles?: Role[];
  /** Treat a missing search key on the target route as a match for this item. */
  matchWhenEmpty?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Home", icon: LayoutDashboard, gate: null },
      { to: "/opportunities", label: "Opportunities", icon: Briefcase, gate: "opportunity.general" },
      { to: "/tasks", label: "Tasks", icon: CheckSquare, gate: null },
      { to: "/calendar", label: "Calendar", icon: Calendar, gate: null },
    ],
  },
  {
    label: "Yacht Industry",
    items: [
      { to: "/companies", label: "Companies", icon: Building2, gate: "company.general", search: { vertical: "Main" }, matchWhenEmpty: true },
      { to: "/contacts", label: "Brokers & Contacts", icon: Users, gate: "contact.general", matchWhenEmpty: true },
      { to: "/listings", label: "Listings", icon: BoatIcon, gate: null },
      { to: "/services", label: "Services adoption", icon: Grid3x3, gate: "services" },
      { to: "/events", label: "Dealer events", icon: CalendarDays, gate: "events" },
    ],
  },
  {
    label: "Fintech",
    items: [
      { to: "/companies", label: "Banks & Lenders", icon: Landmark, gate: "company.general", search: { vertical: "FinTech" } },
      { to: "/contacts", label: "Loan Brokers", icon: DealerIcon, gate: "contact.general", search: { vertical: "FinTech", type: "Bank Contact" } },
      { to: "/contacts", label: "Applicants", icon: Wallet, gate: "easyfund", search: { vertical: "FinTech", type: "Loan Applicant" } },
      { to: "/lender", label: "Lender dashboard", icon: Banknote, gate: "easyfund" },
      { to: "/insurance", label: "Insurance dashboard", icon: Umbrella, gate: "mastercover" },
      { to: "/referrals", label: "Referrals dashboard", icon: HandCoins, gate: "referrals" },
    ],
  },
  {
    label: "Billing department",
    items: [
      { to: "/billing/invoices", label: "All invoices", icon: Receipt, gate: "billing" },
      { to: "/billing/estimates", label: "All estimates", icon: FileText, gate: "billing" },
      { to: "/billing/invoices/new", label: "New invoice", icon: FilePlus2, gate: "billing" },
      { to: "/billing/estimates/new", label: "New estimate", icon: FileCheck2, gate: "billing" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/emails", label: "Emails", icon: Mail, gate: "emails" },
      { to: "/marketing/statistics", label: "Social statistics", icon: BarChart3, gate: "emails", hiddenForRoles: ["lender_partner", "insurance_partner"] },
      { to: "/marketing/content", label: "Content calendar", icon: CalendarDays, gate: "emails", hiddenForRoles: ["lender_partner", "insurance_partner"] },
      { to: "/buyers", label: "Buyers", icon: Users, gate: "contact.general", hiddenForRoles: ["lender_partner", "insurance_partner"] },
    ],
  },
  {
    label: "System",
    items: [
      // Conversations are not a standalone object — they surface on Contact and
      // Company records (Activity tab). No top-level nav entry by design.
      { to: "/admin", label: "Admin", icon: ShieldCheck, gate: "admin" },
    ],
  },
];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function ApiStatusPill({
  status,
  source,
}: {
  status: "idle" | "connecting" | "online" | "offline";
  source: "api" | "fallback";
}) {
  const online = status === "online" && source === "api";
  const label = status === "connecting"
    ? "API…"
    : online
      ? "API"
      : status === "offline"
        ? "Mock"
        : "Mock";
  const dot = online ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400" : "bg-muted-foreground/60";
  const title = online
    ? "Connected to apps/api. Live data for Companies, Contacts, EasyFund, MasterCover."
    : status === "connecting"
      ? "Connecting to apps/api…"
      : "apps/api unreachable — falling back to mock data. Set VITE_API_URL and run `cd apps/api && npm run dev`.";
  return (
    <span
      title={title}
      className="hidden h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-topbar-foreground/80 sm:inline-flex"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}


export function AppShell({ children }: { children: ReactNode }) {
  // 3D Tour storage: raise the owner task 30 days before the annual mark,
  // app-wide (not only when the Studio tab is open).
  useEffect(() => {
    ensureRenewalTasks();
  }, []);

  const { user, setRole, setCurrency, can, isRealSession } = useAuth();
  const navigate = useNavigate();
  // Switching into a partner role drops you on that partner's scoped dashboard
  // (otherwise you'd stay on the current, now-restricted, page).
  const switchRole = (r: Role) => {
    setRole(r);
    if (r === "lender_partner") navigate({ to: "/lender" });
    else if (r === "insurance_partner") navigate({ to: "/insurance" });
  };
  const { apiStatus, source } = usePermissions();
  const [sigOpen, setSigOpen] = useState(false);



  
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("yw:sidebar-collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("yw:sidebar-collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);


  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar - solid dark */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-topbar px-4 text-topbar-foreground">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <YachtWayLogo className="h-6 w-auto" />
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/60 text-topbar-foreground/80 transition-colors hover:bg-background"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <GlobalSearchTrigger onOpen={() => setSearchOpen(true)} />
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />


        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrency(user.currency === "USD" ? "EUR" : "USD")}
            className="flex h-9 items-center gap-1 rounded-lg border border-border bg-background/60 p-1 text-xs font-semibold transition-colors hover:border-border hover:bg-background"
            title="Toggle display currency"
          >
            <span className={`rounded-md px-2 py-1 transition-colors ${user.currency === "USD" ? "bg-brand text-brand-foreground shadow-sm" : "text-muted-foreground hover:text-topbar-foreground"}`}>
              USD
            </span>
            <span className={`rounded-md px-2 py-1 transition-colors ${user.currency === "EUR" ? "bg-brand text-brand-foreground shadow-sm" : "text-muted-foreground hover:text-topbar-foreground"}`}>
              EUR
            </span>
          </button>
          <ApiStatusPill status={apiStatus} source={source} />

          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />


          {isRealSession ? (
            <SessionMenu />
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-xs font-semibold text-topbar-foreground/90 transition-colors hover:border-border hover:bg-background">
                  <span className="hidden text-topbar-foreground/50 sm:inline">Viewing as</span>
                  <span>{ROLE_LABELS[user.role]}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-topbar-foreground/50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Switch demo role</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup value={user.role} onValueChange={(v) => switchRole(v as Role)}>
                    <DropdownMenuRadioItem value="sales_rep">Sales Rep</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="fintech">Fintech</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="marketing">Marketing</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="admin">Admin</DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                      External partner logins
                    </DropdownMenuLabel>
                    <DropdownMenuRadioItem value="lender_partner">Lender Partner</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="insurance_partner">Insurance Partner</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled className="text-xs">
                    Demo mode - set VITE_WORKOS_CLIENT_ID for real sign-in
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Link
                to="/settings/notifications"
                title="Notification settings"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/60 text-topbar-foreground/80 transition-colors hover:border-border hover:bg-background hover:text-brand"
              >
                <Bell className="h-4 w-4" />
              </Link>

              <button
                type="button"
                onClick={() => setSigOpen(true)}
                title="My email signature"
                className="group flex h-10 items-center gap-2.5 rounded-full border border-border bg-background/60 py-1 pl-1 pr-3 transition-colors hover:border-border hover:bg-background"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-gradient-to-tr from-brand to-brand-deep text-xs font-bold text-brand-foreground shadow-inner">
                  {initials(user.name)}
                </span>
                <span className="hidden text-left text-xs leading-tight sm:block">
                  <span className="block font-semibold text-topbar-foreground group-hover:text-brand transition-colors">
                    {user.name}
                  </span>
                </span>
              </button>
              <EmailSignatureDialog open={sigOpen} onOpenChange={setSigOpen} />
            </>
          )}


        </div>
      </header>


      <div className="flex flex-1">
        <aside
          className={`shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-out ${
            collapsed ? "w-16" : "w-60"
          }`}
        >
          <SidebarNav
            collapsed={collapsed}
            pathname={pathname}
            can={can}
          />
        </aside>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({
  collapsed,
  pathname,
  can,
}: {
  collapsed: boolean;
  pathname: string;
  can: (r: ResourceClass) => boolean;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const [mouseY, setMouseY] = useState<number | null>(null);

  // macOS-dock magnification: scale icons by distance to cursor Y.
  const magnify = (el: HTMLElement | null): number => {
    if (!collapsed || mouseY == null || !el) return 1;
    const r = el.getBoundingClientRect();
    const center = r.top + r.height / 2;
    const dist = Math.abs(center - mouseY);
    const radius = 90; // px of influence
    if (dist > radius) return 1;
    // 1 → 1.55, eased
    const t = 1 - dist / radius;
    return 1 + 0.55 * Math.pow(t, 1.4);
  };

  const { user } = useAuth();
  // External partner logins get a minimal portal — only their own dashboard.
  const partnerNav: NavGroup[] = [
    {
      label: "Portal",
      items:
        user.role === "insurance_partner"
          ? [{ to: "/insurance", label: "My deals", icon: Umbrella, gate: "mastercover" }]
          : [{ to: "/lender", label: "My deals", icon: Banknote, gate: "easyfund" }],
    },
  ];
  const baseNav = isPartnerRole(user.role) ? partnerNav : NAV;
  const visibleGroups = baseNav
    .filter((g) => g.label !== "Fintech" || canSeeFinTech(user.role))
    .filter((g) => g.label !== "Billing department" || can("billing"))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.hiddenForRoles?.includes(user.role)) return false;
        // Access areas the session doesn't hold are hidden outright - the
        // matching route is guarded too, so a deep link lands on "restricted".
        return item.gate === null || can(item.gate);
      }),
    }))
    .filter((g) => g.items.length > 0);


  return (
    <nav
      ref={navRef}
      onMouseMove={(e) => setMouseY(e.clientY)}
      onMouseLeave={() => setMouseY(null)}
      className={`flex flex-col gap-3 py-2 ${collapsed ? "px-1.5" : "p-2"}`}
    >
      {visibleGroups.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div className="mx-2 my-1 h-px bg-sidebar-border/70" />
          ) : (
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
          )}
          <div className={`flex flex-col ${collapsed ? "gap-1.5 items-center" : "gap-0.5"}`}>
            {group.items.map((item) => (
              <NavRow
                key={`${group.label}-${item.to}-${item.label}`}
                item={item}
                collapsed={collapsed}
                pathname={pathname}
                can={can}
                magnify={magnify}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavRow({
  item,
  collapsed,
  pathname,
  can,
  magnify,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  can: (r: ResourceClass) => boolean;
  magnify: (el: HTMLElement | null) => number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const currentSearch = useRouterState({
    select: (st) => st.location.search as Record<string, unknown>,
  });
  const [scale, setScale] = useState(1);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!collapsed) {
      setScale(1);
      return;
    }
    let raf = 0;
    const tick = () => {
      setScale(magnify(ref.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [collapsed, magnify]);

  const basePath = item.to.split("?")[0];
  const pathActive =
    basePath === "/"
      ? pathname === "/"
      : pathname === basePath || pathname.startsWith(basePath + "/");
  // Several nav rows point at the same route with different filters (Companies
  // vs Banks & Lenders). Only highlight the row whose filters the user picked.
  const searchMatch = (() => {
    const entries = Object.entries(item.search ?? {});
    if (entries.length) {
      return entries.every(([k, v]) => {
        const current = currentSearch[k];
        if (current === undefined) return !!item.matchWhenEmpty;
        return String(current) === v;
      });
    }
    // Rows without filters stay active only on an unfiltered view.
    return currentSearch.vertical === undefined && currentSearch.type === undefined;
  })();
  const active = pathActive && searchMatch;
  const locked = item.gate ? !can(item.gate) : false;
  const Icon = item.icon;

  if (collapsed) {
    const tileCls = `group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
      locked
        ? "cursor-not-allowed text-muted-foreground opacity-60"
        : active
          ? "bg-accent text-brand-deep"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
    }`;
    const content = (
      <div
        ref={ref}
        className={tileCls}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "left center",
          transition: "transform 120ms ease-out, background-color 150ms",
          zIndex: isHovered ? 100 : scale > 1.05 ? 10 : 1,
        }}
        title={item.label}
      >
        <Icon className="h-5 w-5" />
        {locked && (
          <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-sidebar p-[1px] text-muted-foreground" />
        )}
        {/* Dock-style label tooltip */}
        <span
          className="pointer-events-none absolute left-full top-1/2 z-[150] ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
        >
          {item.label}
          {item.stub && <span className="ml-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">soon</span>}
        </span>
      </div>
    );
    if (locked || item.stub) return content;
    return (
      <Link to={item.to} search={item.search as never} className="contents">
        {content}
      </Link>
    );
  }

  const inner = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.stub && (
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          soon
        </span>
      )}
      {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
    </>
  );

  const cls = `flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
    locked
      ? "cursor-not-allowed text-muted-foreground opacity-60"
      : active
        ? "bg-accent text-brand-deep"
        : "text-sidebar-foreground hover:bg-sidebar-accent"
  }`;

  if (locked || item.stub) {
    return <div className={cls}>{inner}</div>;
  }
  return <Link to={item.to} search={item.search as never} className={cls}>{inner}</Link>;
}
