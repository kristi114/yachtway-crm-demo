import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageBody } from "@/components/page-header";

export function LockedRecord({
  kind,
  backTo,
  backLabel,
}: {
  kind: "company" | "contact" | "opportunity";
  backTo: string;
  backLabel: string;
}) {
  return (
    <AppShell>
      <PageBody>
        <div className="mx-auto max-w-md rounded-sm border border-border bg-surface p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">FinTech {kind} - restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This record belongs to the FinTech vertical. Sales reps don't have access.
            Ask a FinTech teammate or an admin if you need details.
          </p>
          <Link
            to={backTo}
            className="mt-4 inline-block text-sm text-brand hover:underline"
          >
            ← {backLabel}
          </Link>
        </div>
      </PageBody>
    </AppShell>
  );
}
