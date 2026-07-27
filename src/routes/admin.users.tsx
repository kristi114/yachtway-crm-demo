import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UserCog, UserPlus, Sliders, Trash2 } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/auth";
import {
  ACCESS_AREAS,
  addUser,
  effectiveGrantsFor,
  removeUser,
  roleGrantsFor,
  setUserGrant,
  updateUser,
  useAdminConfig,
  type ManagedUser,
} from "@/lib/admin-config";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

const ROLES: Role[] = ["sales_rep", "fintech", "marketing", "admin"];
const STATUSES: ManagedUser["status"][] = ["active", "invited", "disabled"];

const STATUS_STYLE: Record<ManagedUser["status"], string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  invited: "border-amber-200 bg-amber-50 text-amber-700",
  disabled: "border-border bg-secondary text-muted-foreground",
};

function AdminUsersPage() {
  const { user: me } = useAuth();
  const cfg = useAdminConfig();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [accessFor, setAccessFor] = useState<string | null>(null);

  const actor = { name: me.name, role: me.role };

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return cfg.users;
    return cfg.users.filter(
      (u) => u.name.toLowerCase().includes(n) || u.email.toLowerCase().includes(n),
    );
  }, [cfg.users, q]);

  const editing = cfg.users.find((u) => u.id === accessFor) ?? null;

  return (
    <PageBody>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users by name or email"
            className="max-w-xs"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{filtered.length} users</span>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add user
            </Button>
          </div>
        </div>

        <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <header className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
            <UserCog className="h-4 w-4 text-brand-deep" />
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
              Users &amp; roles
            </h3>
          </header>
          <ul className="divide-y divide-border">
            {filtered.map((u) => {
              const grants = effectiveGrantsFor(u.role, cfg, u.id);
              const custom = u.extraGrants.length + u.revokedGrants.length;
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{u.name}</span>
                      {u.id === me.id && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">You</Badge>
                      )}
                      <Badge variant="outline" className={`h-4 px-1.5 text-[10px] capitalize ${STATUS_STYLE[u.status]}`}>
                        {u.status}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.email} · {grants.length} access area{grants.length === 1 ? "" : "s"}
                      {custom > 0 && <span className="text-amber-600"> · {custom} exception{custom === 1 ? "" : "s"}</span>}
                    </div>
                  </div>

                  <Select
                    value={u.status}
                    onValueChange={(v) =>
                      updateUser(u.id, { status: v as ManagedUser["status"] }, actor, {
                        action: "User status changed", before: u.status, after: v,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={u.role}
                    onValueChange={(v) =>
                      updateUser(u.id, { role: v as Role, extraGrants: [], revokedGrants: [] }, actor, {
                        action: "Role changed",
                        before: ROLE_LABELS[u.role],
                        after: ROLE_LABELS[v as Role],
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAccessFor(u.id)}>
                    <Sliders className="mr-1.5 h-3.5 w-3.5" />
                    Access
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={u.id === me.id}
                    onClick={() => removeUser(u.id, actor)}
                    aria-label={`Remove ${u.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                No users match that search.
              </li>
            )}
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          Role defaults are configured under Access. Per-user toggles below add or remove areas for a
          single person. Everything is recorded in the audit log and syncs to WorkOS once the admin
          endpoints ship.
        </p>
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} actor={actor} />

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setAccessFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Access for {editing?.name}</DialogTitle>
            <DialogDescription>
              Starts from the {editing ? ROLE_LABELS[editing.role] : ""} role defaults. Toggle an area
              to grant or revoke it for this person only.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {ACCESS_AREAS.map((area) => {
                const roleHas = roleGrantsFor(editing.role, cfg).includes(area.key);
                const on = effectiveGrantsFor(editing.role, cfg, editing.id).includes(area.key);
                return (
                  <label
                    key={area.key}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-secondary/40"
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) => setUserGrant(editing.id, area.key, Boolean(v), actor)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {area.label}
                        {on !== roleHas && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-amber-600">
                            {on ? "granted" : "revoked"}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">{area.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}

function AddUserDialog({
  open, onOpenChange, actor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actor: { name: string; role: Role };
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales_rep");

  const valid = name.trim().length > 1 && /.+@.+\..+/.test(email);

  const submit = () => {
    if (!valid) return;
    addUser({ name, email, role }, actor);
    setName(""); setEmail(""); setRole("sales_rep");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Invite a teammate and pick the role that sets their default CRM access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="au-name">Full name</Label>
            <Input id="au-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="au-email">Work email</Label>
            <Input id="au-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@YachtWay.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === "fintech"
                ? "Sees both the sales side and the FinTech side (EasyFund, MasterCover, financing threads)."
                : role === "sales_rep"
                  ? "Sees the sales side only - companies, contacts, pipelines and conversations."
                  : role === "marketing"
                    ? "Read-only view of companies and contacts."
                    : "Full access, including the admin console."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
