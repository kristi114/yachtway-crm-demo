import { guarded } from "@/components/require-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Mail } from "lucide-react";

import { InvoiceDocument } from "@/components/invoice-document";
import { Button } from "@/components/ui/button";
import { getDoc, useBillingStore } from "@/lib/billing";

export const Route = createFileRoute("/billing/invoice-pdf/$id")({
  head: () => {
    const title = "Invoice PDF — YachtWay CRM";
    const description =
      "Print-ready invoice document you can export as a standalone PDF and send to the client.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: guarded("billing", "Billing", InvoicePdfPage),
});

/**
 * Standalone, chrome-free invoice sheet. Nothing from the app shell renders here
 * so "Save as PDF" from the browser print dialog produces a clean one-file
 * document that can be emailed as-is.
 */
function InvoicePdfPage() {
  useBillingStore();
  const { id } = Route.useParams();
  const doc = getDoc(id);

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <p className="text-sm text-muted-foreground">
          That document does not exist.{" "}
          <Link to="/billing/invoices" className="text-brand hover:underline">
            Back to invoices
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="print-canvas min-h-screen bg-background">
      <div className="no-print sticky top-0 z-10 border-b border-border bg-topbar/90 backdrop-blur">
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3 px-4 py-3">
          <Button size="sm" variant="outline" asChild>
            <Link to="/billing/invoices/$id" params={{ id: doc.id }}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to {doc.number}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            {doc.recipient_email && (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`mailto:${doc.recipient_email}?subject=${encodeURIComponent(
                    `${doc.kind === "estimate" ? "Estimate" : "Invoice"} ${doc.number} from YachtWay`,
                  )}`}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Email
                </a>
              </Button>
            )}
            <Button size="sm" onClick={() => window.print()}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="print-canvas px-4 py-8">
        <InvoiceDocument doc={doc} />
        <p className="no-print mx-auto mt-4 max-w-[820px] text-center text-xs text-muted-foreground">
          Use “Download PDF” and pick “Save as PDF” as the destination to export this invoice as a
          standalone file.
        </p>
      </div>
    </div>
  );
}
