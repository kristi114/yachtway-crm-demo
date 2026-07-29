import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/auth";
import { updateUser, useAdminConfig, type ManagedUser } from "@/lib/admin-config";

export const Route = createFileRoute("/admin/users/$id")({
  component: UserDetailPage,
});

const ROLES: Role[] = ["sales_rep", "fintech", "marketing", "admin"];
const STATUSES: ManagedUser["status"][] = ["active", "invited", "disabled"];
const CURRENCIES = ["USD", "EUR", "GBP"] as const;

function UserDetailPage() {
  const { id } = Route.useParams();
  const { user: me } = useAuth();
  const cfg = useAdminConfig();
  const user = cfg.users.find((u) => u.id === id);

  const [draft, setDraft] = useState<Partial<ManagedUser> | null>(null);

  if (!user) {
    return (
      <PageBody>
        <p className="text-sm text-muted-foreground">
          That user does not exist.{" "}
          <Link to="/admin/users" className="text-brand hover:underline">Back to users</Link>
        </p>
      </PageBody>
    );
  }

  const v = { ...user, ...draft };
  const set = (patch: Partial<ManagedUser>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));
  const dirty = draft !== null;

  function save() {
    if (!draft) return;
    updateUser(user!.id, draft, { name: me.name, role: me.role }, { action: "User updated" });
    setDraft(null);
    toast.success("User saved.");
  }

  return (
    <PageBody>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to="/admin/users"><ArrowLeft className="h-4 w-4" /> Users</Link>
          </Button>
          <h2 className="text-lg font-semibold">{v.name || "User"}</h2>
        </div>
        <Button size="sm" onClick={save} disabled={!dirty}>
          <Save className="h-4 w-4" /> {dirty ? "Save changes" : "Saved"}
        </Button>
      </div>

      <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={v.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={v.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Role (permission set)">
            <Select value={v.role} onValueChange={(r) => set({ role: r as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={v.status} onValueChange={(s) => set({ status: s as ManagedUser["status"] })}>
              <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Region">
            <Input value={v.region ?? ""} onChange={(e) => set({ region: e.target.value })} />
          </Field>
          <Field label="Currency">
            <Select value={v.currency} onValueChange={(c) => set({ currency: c })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notifications</div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={v.notifyBanner} onCheckedChange={(c) => set({ notifyBanner: Boolean(c) })} />
              Banner
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={v.notifyEmail} onCheckedChange={(c) => set({ notifyEmail: Boolean(c) })} />
              Email
            </label>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Fine-grained access areas are managed from the Access controls on the Users &amp; roles list.
        </p>
      </div>
    </PageBody>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
