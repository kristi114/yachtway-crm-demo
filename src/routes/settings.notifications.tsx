import { createFileRoute } from "@tanstack/react-router";
import { Bell, Mail } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { useAdminConfig, updateUser } from "@/lib/admin-config";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationSettingsPage,
});

function Toggle({
  on, onChange, disabled,
}: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-brand" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function NotificationSettingsPage() {
  const { user } = useAuth();
  const cfg = useAdminConfig();
  // Match the signed-in user to their managed profile (id first, then email).
  const me = cfg.users.find((u) => u.id === user.id) ?? cfg.users.find((u) => u.email === user.email);
  const actor = { name: user.name, role: user.role };

  const banner = me?.notifyBanner ?? true;
  const email = me?.notifyEmail ?? true;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="Notifications"
        subtitle="Choose how you want to be notified. These apply to your account only."
      />
      <PageBody>
        <div className="max-w-2xl space-y-3">
          <Row
            icon={<Bell className="h-4 w-4 text-brand" />}
            title="Banner notifications"
            desc="Show alerts as a banner at the top of your home dashboard."
          >
            <Toggle
              on={banner}
              disabled={!me}
              onChange={(v) =>
                me && updateUser(me.id, { notifyBanner: v }, actor, {
                  action: v ? "Banner notifications on" : "Banner notifications off",
                })
              }
            />
          </Row>

          <Row
            icon={<Mail className="h-4 w-4 text-brand" />}
            title="Email notifications"
            desc="Also email me when I'm notified (sent from YachtWay system email)."
          >
            <Toggle
              on={email}
              disabled={!me}
              onChange={(v) =>
                me && updateUser(me.id, { notifyEmail: v }, actor, {
                  action: v ? "Email notifications on" : "Email notifications off",
                })
              }
            />
          </Row>

          {!me && (
            <p className="rounded-sm border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
              Your account doesn't have an editable profile in this demo, so preferences
              show the defaults (both on) and can't be changed here.
            </p>
          )}
        </div>
      </PageBody>
    </AppShell>
  );
}

function Row({
  icon, title, desc, children,
}: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-4 py-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10">{icon}</span>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
