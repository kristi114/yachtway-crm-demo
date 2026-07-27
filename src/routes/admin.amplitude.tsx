import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Users2, UserCog, Copy, Check, ShieldCheck, KeyRound } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Admin → Amplitude destination.
 *
 * Configuration + monitoring surface for the CRM's Amplitude "Webhook"
 * destination (Events, User Properties, Cohorts). The endpoint URLs and auth
 * model mirror the backend routes in apps/api/src/routes/amplitude.ts. The
 * "recent syncs" and "cohorts" tables are mock previews in this build — they
 * read from apps/api once the CRM DB is provisioned.
 */
export const Route = createFileRoute("/admin/amplitude")({
  component: AmplitudeDestinationPage,
});

const API_BASE = "https://api.crm.yachtway.app";

const DESTINATIONS = [
  {
    type: "Events",
    icon: Activity,
    path: "/webhooks/amplitude/events",
    desc: "Streams behavioural events, joined to contacts by user_id (= YachtWay DB ID).",
  },
  {
    type: "User Properties",
    icon: UserCog,
    path: "/webhooks/amplitude/user-properties",
    desc: "Syncs identify/user-property updates onto the matched contact record.",
  },
  {
    type: "Cohorts",
    icon: Users2,
    path: "/webhooks/amplitude/cohorts",
    desc: "Pushes full cohort membership snapshots for segmentation and targeting.",
  },
] as const;

const RECENT_SYNCS = [
  { type: "Events", when: "2m ago", detail: "128 events · 121 linked · 7 unmatched", status: "ok" },
  { type: "Cohorts", when: "14m ago", detail: "“High-intent buyers” · 342 members · 318 linked", status: "ok" },
  { type: "User Properties", when: "1h ago", detail: "54 updates · 54 applied", status: "ok" },
  { type: "Events", when: "3h ago", detail: "0 events · rejected (bad signature)", status: "warn" },
] as const;

const COHORTS = [
  { name: "High-intent buyers", members: 342, linked: 318, synced: "14m ago" },
  { name: "Dormant brokers (30d)", members: 87, linked: 87, synced: "2h ago" },
  { name: "Trial — no listing added", members: 210, linked: 190, synced: "yesterday" },
] as const;

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded border border-border bg-muted/50 px-2 py-1 text-xs">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function AmplitudeDestinationPage() {
  return (
    <PageBody>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold">Authentication</h2>
            <Badge variant="secondary" className="ml-1">SOC 2</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every destination is a public webhook that authenticates itself. Configure Amplitude to
            send a shared secret header; an optional HMAC over the body adds defense in depth.
          </p>
          <div className="mt-4 space-y-2">
            <CopyRow label="Auth header" value="Authorization: Bearer ${AMPLITUDE_WEBHOOK_SECRET}" />
            <CopyRow label="Alt header" value="X-Amplitude-Secret: ${AMPLITUDE_WEBHOOK_SECRET}" />
            <CopyRow label="HMAC (opt.)" value="X-Amplitude-Signature: hex(HMAC-SHA256(body))" />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            Secrets live in the API environment (AMPLITUDE_WEBHOOK_SECRET / AMPLITUDE_SIGNING_KEY) —
            never in the client. Endpoints return 503 until a secret is set.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Destinations</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {DESTINATIONS.map((d) => (
              <div key={d.type} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <d.icon className="h-4 w-4 text-brand" />
                  <h3 className="text-sm font-semibold">{d.type}</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.desc}</p>
                <code className="mt-3 block truncate rounded border border-border bg-muted/50 px-2 py-1 text-[11px]">
                  POST {API_BASE}{d.path}
                </code>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Recent syncs</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {RECENT_SYNCS.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.type}</span>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${s.status === "ok" ? "bg-emerald-500" : "bg-amber-500"}`}
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{s.when}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Cohorts</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {COHORTS.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.members} members · {c.linked} linked to contacts
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{c.synced}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageBody>
  );
}
