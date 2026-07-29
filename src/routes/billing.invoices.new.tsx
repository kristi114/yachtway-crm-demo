import { guarded } from "@/components/require-access";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, X, Eye } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { COMPANIES, contactsForCompany, OPPORTUNITIES, getOpportunity } from "@/lib/mock-data";
import { addDoc, sendDoc, type DocKind, type BillingDoc, type Discount } from "@/lib/billing";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Copy, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  LineItemsBuilder, lineFromProduct, applyProductSelection, newBlankLine, toLineItems, draftsTotal, validateLineItems,
  type LineDraft, type VesselOption,
} from "@/components/line-items-builder";
import { ProductPickerDialog } from "@/components/product-picker-dialog";
import { listingsForCompany, getBrand } from "@/lib/mock-data";
import { useStudioPass } from "@/lib/studio-pass";
import { SHOOT_LOCATIONS, isSouthFloridaShoot } from "@/lib/products";
import { InvoiceDocument } from "@/components/invoice-document";




export function NewBillingDocForm({
  kind,
  initialCompanyId,
  initialOpportunityId,
}: {
  kind: DocKind;
  initialCompanyId?: string;
  initialOpportunityId?: string;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const initialOpp = initialOpportunityId ? getOpportunity(initialOpportunityId) : undefined;
  const [companyId, setCompanyId] = useState(
    (initialOpp?.companyId && COMPANIES.find((c) => c.id === initialOpp.companyId)?.id) ||
      (initialCompanyId && COMPANIES.find((c) => c.id === initialCompanyId)?.id) ||
      COMPANIES[0]?.id ||
      "",
  );
  const company = COMPANIES.find((c) => c.id === companyId);
  const studioPass = useStudioPass(companyId);

  // New billing documents default to USD; reps switch to EUR/GBP per deal.
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState<Discount | undefined>(undefined);
  const [opportunityId, setOpportunityId] = useState(initialOpp?.id ?? "");
  const [shootLocation, setShootLocation] = useState("south_florida");
  const [items, setItems] = useState<LineDraft[]>(
    initialOpp
      ? [newBlankLine({
          description: `${initialOpp.pipeline} - ${initialOpp.name}`,
          unit_price: initialOpp.amountUsd,
        })]
      : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const companyContacts = useMemo(() => contactsForCompany(companyId), [companyId]);
  const companyOpportunities = useMemo(
    () => OPPORTUNITIES.filter((o) => o.companyId === companyId),
    [companyId],
  );
  const [recipientContactId, setRecipientContactId] = useState<string>(initialOpp?.contactId ?? "");
  const recipientContact = companyContacts.find((c) => c.id === recipientContactId);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const linkedOpp = opportunityId ? getOpportunity(opportunityId) : undefined;
  const isStudio = linkedOpp?.pipeline === "Studio";

  const previewDoc: BillingDoc | null = useMemo(() => {
    if (!company || items.length === 0) return null;
    const cleaned = toLineItems(items);
    if (cleaned.length === 0) return null;
    return {
      id: "preview",
      kind,
      number: kind === "invoice" ? "INV-PREVIEW" : "EST-PREVIEW",
      companyId: company.id,
      name: company.name,
      currency,
      status: "draft",
      issued_at: new Date().toISOString(),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      line_items: cleaned,
      discount,
      notes: notes.trim() || undefined,
      created_by_name: user.name,
      recipient_email: recipientContact?.email,
      recipient_contact_id: recipientContact?.id,
      recipient_contact_name: recipientContact
        ? `${recipientContact.firstName} ${recipientContact.lastName}`
        : undefined,
      cc_emails: ccEmails.length ? ccEmails : undefined,
      opportunityId: linkedOpp?.id,
      opportunityName: linkedOpp?.name,
      shootLocation,
    };
  }, [company, items, kind, currency, dueAt, notes, discount, user.name, recipientContact, ccEmails, linkedOpp, shootLocation]);

  const total = useMemo(() => draftsTotal(items), [items]);
  const vessels: VesselOption[] = useMemo(
    () =>
      listingsForCompany(companyId).map((l) => ({
        id: l.id,
        label: `${getBrand(l.brandId)?.name ?? ""} ${l.model} (${l.year})`.trim(),
        lengthFt: l.lengthFt,
      })),
    [companyId],
  );

  const label = kind === "invoice" ? "Invoice" : "Estimate";
  const returnTo = kind === "invoice" ? "/billing/invoices" : "/billing/estimates";

  const build = (status: "draft" | "sent") => {
    if (!company) return null;
    const validation = validateLineItems(items);
    if (validation.length > 0) {
      toast.error(validation[0].message);
      return null;
    }
    const cleaned = toLineItems(items);
    if (cleaned.length === 0) return null;
    return addDoc({
      kind,
      companyId: company.id,
      name: company.name,
      currency,
      status,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      line_items: cleaned,
      discount,
      notes: notes.trim() || undefined,
      created_by_name: user.name,
      opportunityId: linkedOpp?.id,
      opportunityName: linkedOpp?.name,
      shootLocation,
    });
  };

  const submit = () => {
    const doc = build("draft");
    if (!doc) return;
    navigate({ to: returnTo });
  };

  const emailRe = /.+@.+\..+/;

  const addCc = () => {
    const v = ccDraft.trim();
    if (!v) return;
    if (!emailRe.test(v)) {
      toast.error("Enter a valid email");
      return;
    }
    if (ccEmails.includes(v) || v === recipientContact?.email) return;
    setCcEmails((prev) => [...prev, v]);
    setCcDraft("");
  };

  const sendToClient = () => {
    if (!recipientContact) {
      toast.error("Select a recipient contact at the company");
      return;
    }
    if (!emailRe.test(recipientContact.email)) {
      toast.error("Recipient contact has no valid email");
      return;
    }
    const doc = build("sent");
    if (!doc) {
      toast.error("Add at least one line item");
      return;
    }
    const sent = sendDoc(doc.id, {
      recipient_email: recipientContact.email,
      recipient_contact_id: recipientContact.id,
      recipient_contact_name: `${recipientContact.firstName} ${recipientContact.lastName}`,
      cc_emails: ccEmails,
    });
    if (!sent?.share_token) return;
    const url = `${window.location.origin}/billing/share/${sent.share_token}`;
    setShareUrl(url);
    const extra = ccEmails.length ? ` (+${ccEmails.length} cc)` : "";
    toast.success(`${label} sent to ${recipientContact.email}${extra}`);
  };

  return (
    <AppShell>
      <PageHeader
        title={`New ${label.toLowerCase()}`}
        subtitle={<span>Draft a {label.toLowerCase()} for a company</span>}
      />
      <PageBody>
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="space-y-4 rounded-sm border border-border bg-surface p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR - €</SelectItem>
                    <SelectItem value="USD">USD - $</SelectItem>
                    <SelectItem value="GBP">GBP - £</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Shoot location</Label>
                <Select value={shootLocation} onValueChange={setShootLocation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHOOT_LOCATIONS.map((loc) => (
                      <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSouthFloridaShoot(shootLocation) ? (
                  <p className="text-[11px] text-muted-foreground">
                    South Florida shoots include travel — no travel fee should be added.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Travel fee must be added manually from the catalog if applicable.
                  </p>
                )}
              </div>
              {kind === "invoice" && (
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  {isStudio ? (
                    <div className="flex h-9 items-center rounded-lg border border-border bg-secondary/40 px-3 text-sm text-muted-foreground">
                      Due upon receipt
                    </div>
                  ) : (
                    <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                  )}
                  {isStudio && (
                    <p className="text-[11px] text-muted-foreground">
                      Studio invoices are always due upon receipt.
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Linked opportunity (optional)</Label>
                <Select
                  value={opportunityId || "none"}
                  onValueChange={(v) => {
                    const id = v === "none" ? "" : v;
                    setOpportunityId(id);
                    const o = id ? getOpportunity(id) : undefined;
                    if (o?.pipeline === "Studio") setDueAt("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No opportunity linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No opportunity linked</SelectItem>
                    {companyOpportunities.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.pipeline} · {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {companyOpportunities.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    This company has no opportunities yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          <LineItemsBuilder
            lines={items}
            onChange={setItems}
            currency={currency}
            onAddProduct={() => setPickerOpen(true)}
            vessels={vessels}
            studioPassActive={studioPass?.status === "active"}
            shootLocation={shootLocation}
            discount={discount}
            onDiscountChange={setDiscount}
          />



          <section className="space-y-2 rounded-sm border border-border bg-surface p-5 shadow-sm">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes or payment terms visible on the document"
            />
          </section>

          <section className="space-y-3 rounded-sm border border-border bg-surface p-5 shadow-sm">
            <div>
              <Label>Send to client</Label>
              <p className="text-xs text-muted-foreground">
                Pick the person at {company?.name ?? "the company"} who receives this {label.toLowerCase()}.
                {kind === "estimate" ? " They'll be able to accept or decline it." : " They'll be able to view and pay it."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Primary recipient</Label>
              {companyContacts.length === 0 ? (
                <p className="text-xs text-destructive">
                  No contacts on file for this company. Add a contact first.
                </p>
              ) : (
                <Select value={recipientContactId} onValueChange={setRecipientContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contact…" />
                  </SelectTrigger>
                  <SelectContent>
                    {companyContacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                        {c.roleAtDealership ? ` - ${c.roleAtDealership}` : ""}
                        {c.email ? ` · ${c.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {recipientContact && (
                <p className="text-[11px] text-muted-foreground">
                  Will be sent to <span className="font-medium text-foreground">{recipientContact.email}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">CC additional recipients</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={ccDraft}
                  onChange={(e) => setCcDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCc(); } }}
                  placeholder="finance@example.com"
                />
                <Button type="button" variant="outline" onClick={addCc}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {ccEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ccEmails.map((e) => (
                    <span
                      key={e}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[11px]"
                    >
                      {e}
                      <button
                        type="button"
                        onClick={() => setCcEmails((prev) => prev.filter((x) => x !== e))}
                        aria-label={`Remove ${e}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: returnTo })}>Cancel</Button>
            <Button variant="outline" onClick={submit}>Save as draft</Button>
            <Button variant="outline" disabled={!previewDoc} onClick={() => setPreviewOpen(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              See {label.toLowerCase()} preview
            </Button>
            <Button onClick={sendToClient}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send {label.toLowerCase()} to client
            </Button>
          </div>
        </div>
      </PageBody>

      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currency={currency}
        defaultLengthFt={vessels[0]?.lengthFt}
        studioPassActive={studioPass?.status === "active"}
        selectedProductIds={items.map((i) => i.productId).filter((id): id is string => !!id)}
        onPick={(products, lengthFt) =>
          setItems((prev) => applyProductSelection(prev, products, lengthFt ?? vessels[0]?.lengthFt))
        }
      />

      <Dialog open={!!shareUrl} onOpenChange={(open) => { if (!open) { setShareUrl(null); navigate({ to: returnTo }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label} sent</DialogTitle>
            <DialogDescription>
              We emailed {recipientContact?.email}{ccEmails.length ? ` and cc'd ${ccEmails.join(", ")}` : ""} a link to view this {label.toLowerCase()}.
              {kind === "estimate" && " They can accept or decline it from that page."}
              You can also share the link directly:
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                if (shareUrl) {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success("Link copied");
                }
              }}
              aria-label="Copy link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShareUrl(null); navigate({ to: returnTo }); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{label} preview</DialogTitle>
            <DialogDescription>
              This is how the {label.toLowerCase()} will look to the client. It is not saved yet.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {previewDoc ? <InvoiceDocument doc={previewDoc} /> : (
              <p className="text-sm text-muted-foreground">Add at least one line item to preview.</p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close preview</Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </AppShell>
  );
}


export const Route = createFileRoute("/billing/invoices/new")({
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
      kind="invoice"
      initialCompanyId={companyId}
      initialOpportunityId={opportunityId}
    />
  );
}
