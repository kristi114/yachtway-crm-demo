import { createFileRoute } from "@tanstack/react-router";
import { Mail, Check, Plug, PlugZap } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  PROVIDERS, useEmailProviders, setProviderConnected,
} from "@/lib/email-providers";

export const Route = createFileRoute("/admin/integrations")({
  component: EmailProvidersPage,
});

function EmailProvidersPage() {
  const connected = useEmailProviders();

  return (
    <PageBody>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Email providers</h2>
        <p className="text-sm text-muted-foreground">
          Each class of email is routed to a dedicated provider. Connect a provider to enable
          that class of send. Routing is fixed for deliverability and compliance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {PROVIDERS.map((p) => {
          const on = connected[p.id];
          return (
            <div key={p.id} className="flex flex-col rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"}`}>
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.handlesLabel}</p>
                  </div>
                </div>
                {on ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Not connected
                  </span>
                )}
              </div>

              <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.blurb}</p>

              <div className="mt-4 border-t border-border pt-3">
                {on ? (
                  <Button size="sm" variant="outline" onClick={() => setProviderConnected(p.id, false)}>
                    <Plug className="h-4 w-4" /> Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setProviderConnected(p.id, true)}>
                    <PlugZap className="h-4 w-4" /> Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">Routing</h3>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Email class</th>
              <th className="px-4 py-2 font-semibold">Provider</th>
              <th className="px-4 py-2 font-semibold">Examples</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PROVIDERS.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5 font-medium">{p.handlesLabel}</td>
                <td className="px-4 py-2.5">{p.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.blurb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageBody>
  );
}
