import { useSyncExternalStore } from "react";

import { listSentEmails, type SentEmail } from "@/lib/email-send";
import { listEmailTemplates, type EmailTemplate } from "@/lib/email-templates";

/**
 * Email campaigns.
 *
 * A campaign is a *named series of email sends* — a drip sequence, a boat-show
 * push, an onboarding series. It groups:
 *
 *   • templates (the emails that make up the series, in order), and
 *   • sends     (every actual send attributed to the campaign)
 *
 * so performance can be read per campaign rather than per one-off send. A
 * template can belong to at most one campaign, and carries its `step` position
 * in the series. Attribution of sends is by `campaignId` stamped at send time,
 * falling back to the template's campaign when a send didn't specify one.
 *
 * When the backend lands this becomes two tables (campaign, campaign_step) plus
 * a `campaign_id` column on sends; `campaignRollup` becomes a GROUP BY.
 */

export interface EmailCampaign {
  id: string;
  name: string;
  description: string;
  status: "Draft" | "Active" | "Paused" | "Complete";
  createdAt: string;
  createdBy: string;
}

/** Membership of a template in a campaign, with its position in the series. */
export interface CampaignStep {
  campaignId: string;
  templateId: string;
  /** 1-based position in the series. */
  step: number;
  /** Days after the previous step this email is intended to go out (0 = same day). */
  delayDays: number;
}

export const CAMPAIGN_STATUSES: EmailCampaign["status"][] = [
  "Draft",
  "Active",
  "Paused",
  "Complete",
];

const KEY = "yw:email-campaigns:v1";

interface Persisted {
  campaigns: EmailCampaign[];
  steps: CampaignStep[];
}

function seed(): Persisted {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    campaigns: [
      {
        id: "cmp_onboarding",
        name: "Dealer onboarding series",
        description: "Three-email welcome series for newly signed dealers.",
        status: "Active",
        createdAt: iso(40),
        createdBy: "Mavil",
      },
      {
        id: "cmp_boatshow",
        name: "Summer Boat Show push",
        description: "Pre-show invitations and post-show follow-up.",
        status: "Active",
        createdAt: iso(20),
        createdBy: "Debbie",
      },
    ],
    steps: [],
  };
}

function load(): Persisted {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    };
  } catch {
    return seed();
  }
}

let state: Persisted = load();
const listeners = new Set<() => void>();
const snapshot = () => state;

function emit() {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export function listCampaigns(): EmailCampaign[] {
  return [...state.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCampaign(id: string): EmailCampaign | undefined {
  return state.campaigns.find((c) => c.id === id);
}

export function createCampaign(
  name: string,
  description = "",
  createdBy = "You",
): EmailCampaign {
  const created: EmailCampaign = {
    id: `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || "Untitled campaign",
    description: description.trim(),
    status: "Draft",
    createdAt: new Date().toISOString(),
    createdBy,
  };
  state = { ...state, campaigns: [created, ...state.campaigns] };
  emit();
  return created;
}

export function updateCampaign(id: string, patch: Partial<Omit<EmailCampaign, "id">>) {
  state = {
    ...state,
    campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
  emit();
}

/** Deleting a campaign also detaches its templates (it never deletes emails). */
export function deleteCampaign(id: string) {
  state = {
    campaigns: state.campaigns.filter((c) => c.id !== id),
    steps: state.steps.filter((s) => s.campaignId !== id),
  };
  emit();
}

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

export function stepsForCampaign(campaignId: string): CampaignStep[] {
  return state.steps
    .filter((s) => s.campaignId === campaignId)
    .sort((a, b) => a.step - b.step);
}

/** The campaign a template belongs to, if any. */
export function campaignForTemplate(templateId: string): EmailCampaign | undefined {
  const step = state.steps.find((s) => s.templateId === templateId);
  return step ? getCampaign(step.campaignId) : undefined;
}

export function stepForTemplate(templateId: string): CampaignStep | undefined {
  return state.steps.find((s) => s.templateId === templateId);
}

/**
 * Attach a template to a campaign (moving it if it was in another one). Passing
 * campaignId === null detaches it. Appends to the end of the series unless a
 * step is given.
 */
export function setTemplateCampaign(
  templateId: string,
  campaignId: string | null,
  opts: { step?: number; delayDays?: number } = {},
) {
  const without = state.steps.filter((s) => s.templateId !== templateId);
  if (!campaignId) {
    state = { ...state, steps: renumber(without) };
    emit();
    return;
  }
  const existing = without.filter((s) => s.campaignId === campaignId);
  const step = opts.step ?? existing.length + 1;
  state = {
    ...state,
    steps: renumber([
      ...without,
      { campaignId, templateId, step, delayDays: opts.delayDays ?? 0 },
    ]),
  };
  emit();
}

/** Keep each campaign's step numbers contiguous and 1-based. */
function renumber(steps: CampaignStep[]): CampaignStep[] {
  const byCampaign = new Map<string, CampaignStep[]>();
  for (const s of steps) {
    const arr = byCampaign.get(s.campaignId) ?? [];
    arr.push(s);
    byCampaign.set(s.campaignId, arr);
  }
  const out: CampaignStep[] = [];
  for (const [, arr] of byCampaign) {
    arr
      .sort((a, b) => a.step - b.step)
      .forEach((s, i) => out.push({ ...s, step: i + 1 }));
  }
  return out;
}

export function moveStep(templateId: string, direction: -1 | 1) {
  const step = stepForTemplate(templateId);
  if (!step) return;
  const siblings = stepsForCampaign(step.campaignId);
  const idx = siblings.findIndex((s) => s.templateId === templateId);
  const swapWith = idx + direction;
  if (swapWith < 0 || swapWith >= siblings.length) return;
  const reordered = [...siblings];
  [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
  const renumbered = reordered.map((s, i) => ({ ...s, step: i + 1 }));
  state = {
    ...state,
    steps: [...state.steps.filter((s) => s.campaignId !== step.campaignId), ...renumbered],
  };
  emit();
}

/* ------------------------------------------------------------------ */
/* Roll-up performance                                                 */
/* ------------------------------------------------------------------ */

export interface CampaignRollup {
  campaign: EmailCampaign;
  templates: (EmailTemplate & { step: number })[];
  sends: SentEmail[];
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
  lastSentAt: string | null;
}

/**
 * Every send attributed to a campaign: those stamped with `campaignId`, plus any
 * send whose template belongs to the campaign (covers sends made before the
 * template was attached).
 */
export function sendsForCampaign(campaignId: string): SentEmail[] {
  const templateIds = new Set(stepsForCampaign(campaignId).map((s) => s.templateId));
  return listSentEmails().filter(
    (s) => s.campaignId === campaignId || (s.templateId && templateIds.has(s.templateId)),
  );
}

export function campaignRollup(campaignId: string): CampaignRollup | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  const all = listEmailTemplates();
  const templates = stepsForCampaign(campaignId)
    .map((s) => {
      const t = all.find((x) => x.id === s.templateId);
      return t ? { ...t, step: s.step } : null;
    })
    .filter((t): t is EmailTemplate & { step: number } => Boolean(t));

  const sends = sendsForCampaign(campaignId);
  const recipients = sends.reduce((n, s) => n + (s.recipientCount ?? s.to.length), 0);
  const delivered = sends.reduce((n, s) => n + (s.delivered ?? 0), 0);
  const opened = sends.reduce((n, s) => n + (s.opened ?? 0), 0);
  const clicked = sends.reduce((n, s) => n + (s.clicked ?? 0), 0);
  const base = delivered || recipients;

  return {
    campaign,
    templates,
    sends,
    recipients,
    delivered,
    opened,
    clicked,
    openRate: base ? Math.round((opened / base) * 1000) / 10 : 0,
    clickRate: base ? Math.round((clicked / base) * 1000) / 10 : 0,
    lastSentAt: sends.length ? sends[0].sentAt : null,
  };
}

export function useCampaigns(): Persisted {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    snapshot,
    snapshot,
  );
}
