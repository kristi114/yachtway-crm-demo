import { guarded } from "@/components/require-access";
import { createFileRoute } from "@tanstack/react-router";
import { NewBillingDocForm } from "./billing.invoices.new";

export const Route = createFileRoute("/billing/estimates/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    companyId: typeof search.companyId === "string" ? search.companyId : undefined,
    opportunityId: typeof search.opportunityId === "string" ? search.opportunityId : undefined,
  }),
  component: guarded("billing", "Billing", RouteComponent),
});

function RouteComponent() {
  const { companyId, opportunityId } = Route.useSearch();
  return (
    <NewBillingDocForm
      kind="estimate"
      initialCompanyId={companyId}
      initialOpportunityId={opportunityId}
    />
  );
}
