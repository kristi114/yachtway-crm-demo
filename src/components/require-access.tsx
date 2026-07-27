import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageBody } from "@/components/page-header";
import { useAuth, ROLE_LABELS, type ResourceClass } from "@/lib/auth";

/**
 * Route-level access gate. Sidebar hiding alone isn't a restriction - a deep
 * link still renders the page - so every restricted screen wraps its component
 * in this guard. Grants come from the admin access matrix (role defaults plus
 * per-user overrides), so an admin can hand one person access to a single area.
 */
export function RequireAccess({
  area,
  label,
  children,
}: {
  area: ResourceClass;
  label: string;
  children: ReactNode;
}) {
  const { can, user } = useAuth();
  if (can(area)) return <>{children}</>;

  return (
    <AppShell>
      <PageBody>
        <div className="mx-auto max-w-md rounded-sm border border-border bg-surface p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">{label} - restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The {ROLE_LABELS[user.role]} role doesn't include {label.toLowerCase()}. An admin can
            grant you this area from Admin &rarr; Users.
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
            &larr; Back to home
          </Link>
        </div>
      </PageBody>
    </AppShell>
  );
}

/** Convenience wrapper for `component:` in a route definition. */
export function guarded(area: ResourceClass, label: string, Component: () => ReactNode) {
  return function GuardedRoute() {
    return (
      <RequireAccess area={area} label={label}>
        <Component />
      </RequireAccess>
    );
  };
}
