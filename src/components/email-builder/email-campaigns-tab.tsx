import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Plus, Layers, ChevronRight, ChevronDown, Trash2, ArrowUp, ArrowDown, Mail, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format-date";
import { useAuth } from "@/lib/auth";
import { useEmailTemplatesStore } from "@/lib/email-templates";
import {
  useCampaigns, listCampaigns, createCampaign, updateCampaign, deleteCampaign,
  campaignRollup, setTemplateCampaign, moveStep, campaignForTemplate, CAMPAIGN_STATUSES,
  type EmailCampaign,
} from "@/lib/email-campaigns";

const STATUS_STYLES: Record<EmailCampaign["status"], string> = {
  Draft: "bg-muted text-muted-foreground",
  Active: "bg-emerald-500/10 text-emerald-600",
  Paused: "bg-amber-500/10 text-amber-700",
  Complete: "bg-slate-500/10 text-slate-600",
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums text-brand-deep">{value}</div>
    </div>
  );
}

export function EmailCampaignsTab() {
  const { user } = useAuth();
  useCampaigns(); // re-render on campaign/step changes
  const templates = useEmailTemplatesStore();
  const [open, setOpen] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const campaigns = listCampaigns();
  // Templates not yet part of any campaign — the pool the "Add email" picker offers.
  const unassigned = useMemo(
    () => templates.filter((t) => !campaignForTemplate(t.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, campaigns],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Campaigns</h2>
          <p className="text-xs text-muted-foreground">
            A campaign is a series of email sends — a drip sequence, a show push, an onboarding series.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Layers className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No campaigns yet. Create one, then add emails to it from the Templates tab.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const roll = campaignRollup(c.id);
            if (!roll) return null;
            const isOpen = open === c.id;
            return (
              <section key={c.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-brand-deep">{c.name}</span>
                      <Badge className={STATUS_STYLES[c.status]}>{c.status}</Badge>
                    </div>
                    {c.description && (
                      <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                    )}
                  </div>
                  <div className="hidden shrink-0 gap-4 text-xs text-muted-foreground tabular-nums sm:flex">
                    <span>{roll.templates.length} email{roll.templates.length === 1 ? "" : "s"}</span>
                    <span>{roll.sends.length} send{roll.sends.length === 1 ? "" : "s"}</span>
                    <span>{roll.openRate}% open</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    {/* Roll-up metrics */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <Metric label="Emails" value={roll.templates.length} />
                      <Metric label="Sends" value={roll.sends.length} />
                      <Metric label="Recipients" value={roll.recipients} />
                      <Metric label="Delivered" value={roll.delivered} />
                      <Metric label="Open rate" value={`${roll.openRate}%`} />
                      <Metric label="Click rate" value={`${roll.clickRate}%`} />
                    </div>

                    {/* Status + delete */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs">Status</Label>
                      <select
                        value={c.status}
                        onChange={(e) =>
                          updateCampaign(c.id, { status: e.target.value as EmailCampaign["status"] })
                        }
                        className="native-select h-8 rounded-md border border-border bg-surface px-2 text-[13px]"
                      >
                        {CAMPAIGN_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">
                        Created {formatDateTime(c.createdAt)} by {c.createdBy}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}"? The emails themselves are kept.`)) {
                            deleteCampaign(c.id);
                            setOpen(null);
                          }
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete campaign
                      </Button>
                    </div>

                    {/* Series of emails */}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Series
                      </h3>
                      {roll.templates.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                          No emails in this campaign yet — add one below.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border rounded-md border border-border">
                          {roll.templates.map((t, i) => (
                            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                              <span className="w-6 shrink-0 text-center text-xs font-bold text-brand-deep">
                                {t.step}
                              </span>
                              <Link
                                to="/emails/$id"
                                params={{ id: t.id }}
                                className="min-w-0 flex-1 truncate text-sm font-medium text-brand hover:underline"
                              >
                                {t.name}
                              </Link>
                              <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                                {t.subject}
                              </span>
                              <button
                                type="button"
                                title="Move earlier"
                                disabled={i === 0}
                                onClick={() => moveStep(t.id, -1)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Move later"
                                disabled={i === roll.templates.length - 1}
                                onClick={() => moveStep(t.id, 1)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Remove from campaign"
                                onClick={() => setTemplateCampaign(t.id, null)}
                                className="rounded p-1 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {unassigned.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <Label className="text-xs">Add email</Label>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setTemplateCampaign(e.target.value, c.id);
                                e.target.value = "";
                              }
                            }}
                            className="native-select h-8 flex-1 rounded-md border border-border bg-surface px-2 text-[13px]"
                          >
                            <option value="">Select a template…</option>
                            {unassigned.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Sends attributed to this campaign */}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Sends
                      </h3>
                      {roll.sends.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                          Nothing sent from this campaign yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border rounded-md border border-border">
                          {roll.sends.map((s) => (
                            <li key={s.id}>
                              <Link
                                to="/emails/sent/$id"
                                params={{ id: s.id }}
                                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/40"
                              >
                                <Mail className="h-3.5 w-3.5 shrink-0 text-brand" />
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {s.subject || "(no subject)"}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                  {s.recipientCount ?? s.to.length} · {formatDateTime(s.sentAt)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* New campaign */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              Group a series of emails so their performance rolls up together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Name</Label>
              <Input
                id="camp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dealer onboarding series"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-desc">Description (optional)</Label>
              <Textarea
                id="camp-desc"
                rows={2}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                const c = createCampaign(name, desc, user.name);
                setName("");
                setDesc("");
                setCreateOpen(false);
                setOpen(c.id);
              }}
            >
              Create campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
