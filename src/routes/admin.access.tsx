import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { ShieldCheck, RotateCcw } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/auth";
import {
  ACCESS_AREAS,
  BASE_ROLE_GRANTS,
  resetRoleGrants,
  roleGrantsFor,
  setRoleGrant,
  useAdminConfig,
} from "@/lib/admin-config";

export const Route = createFileRoute("/admin/access")({
  component: AdminAccessPage,
});

const ROLES: Role[] = ["sales_rep", "fintech", "marketing", "admin"];
const GROUPS = ["Sales", "FinTech", "System"] as const;

function AdminAccessPage() {
  const { user: me } = useAuth();
  const cfg = useAdminConfig();

  return (
    <PageBody>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Decide what each role can see in the CRM. Sales roles typically get the sales side only,
          while FinTech roles see both sales and the lending / insurance side.
        </p>

        <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <header className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
            <ShieldCheck className="h-4 w-4 text-brand-deep" />
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
              Role access matrix
            </h3>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Access area
                  </th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <Fragment key={group}>
                    <tr className="bg-secondary/40">
                      <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group}
                      </td>
                    </tr>
                    {ACCESS_AREAS.filter((a) => a.group === group).map((area) => (
                      <tr key={area.key} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{area.label}</div>
                          <div className="text-xs text-muted-foreground">{area.description}</div>
                        </td>
                        {ROLES.map((r) => {
                          const on = roleGrantsFor(r, cfg).includes(area.key);
                          const isDefault = BASE_ROLE_GRANTS[r].includes(area.key) === on;
                          return (
                            <td key={r} className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Checkbox
                                  checked={on}
                                  onCheckedChange={(v) =>
                                    setRoleGrant(r, area.key, Boolean(v), { name: me.name, role: me.role })
                                  }
                                  aria-label={`${ROLE_LABELS[r]} - ${area.label}`}
                                />
                                {!isDefault && (
                                  <span className="text-[10px] text-amber-600">custom</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-secondary/30 px-4 py-2.5">
            {ROLES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!cfg.roleGrants[r]}
                onClick={() => resetRoleGrants(r, { name: me.name, role: me.role })}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset {ROLE_LABELS[r]}
              </Button>
            ))}
          </footer>
        </section>

        <p className="text-xs text-muted-foreground">
          Changes apply immediately in the CRM and are written to the audit log. Per-user exceptions
          can be set from Users &amp; roles.
        </p>
      </div>
    </PageBody>
  );
}
