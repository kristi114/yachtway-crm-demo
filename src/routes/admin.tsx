import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ShieldCheck, Lock } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin console - YachtWay CRM" },
      { name: "description", content: "Manage objects, fields, users, roles and review the CRM audit log." },
      { property: "og:title", content: "Admin console - YachtWay CRM" },
      { property: "og:description", content: "Manage objects, fields, users, roles and review the CRM audit log." },
    ],
  }),
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Objects & fields", exact: true },
  { to: "/admin/users", label: "Users & roles", exact: false },
  { to: "/admin/access", label: "Access", exact: false },
  { to: "/admin/brands", label: "Brands", exact: false },
  { to: "/admin/signatures", label: "Email signatures", exact: false },
  { to: "/admin/amplitude", label: "Amplitude destination", exact: false },
  { to: "/admin/audit", label: "Audit log", exact: false },

] as const;

function AdminLayout() {
  const { can, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!can("admin")) {
    return (
      <AppShell>
        <PageBody>
          <div className="mx-auto max-w-md rounded-sm border border-border bg-surface p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Admin console - restricted</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your role ({user.role.replace("_", " ")}) can't manage CRM configuration.
              Ask an admin if you need access.
            </p>
            <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
              ← Back to home
            </Link>
          </div>
        </PageBody>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="System"
        title="Admin console"
        subtitle="Configure objects and fields, manage user roles, and review every change."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin only
          </span>
        }
      />
      <div className="border-b border-border bg-surface px-6">
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand text-brand-deep"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {/* Child admin screens render here. */}
      <Outlet />
    </AppShell>
  );
}
