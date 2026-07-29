import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateDoc, type BillingDoc, type DocStatus, type LineItem, type Discount } from "@/lib/billing";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { contactsForCompany, OPPORTUNITIES, getOpportunity } from "@/lib/mock-data";
import { toast } from "sonner";
import {
  LineItemsBuilder, draftsFromLineItems, draftsTotal, lineFromProduct, applyProductSelection, toLineItems, validateLineItems,
  type LineDraft, type VesselOption,
} from "@/components/line-items-builder";
import { ProductPickerDialog } from "@/components/product-picker-dialog";
import { listingsForCompany, getBrand } from "@/lib/mock-data";
import { useStudioPass } from "@/lib/studio-pass";
import { SHOOT_LOCATIONS, isSouthFloridaShoot } from "@/lib/products";


const INVOICE_STATUSES: DocStatus[] = ["draft", "sent", "paid", "overdue"];
const ESTIMATE_STATUSES: DocStatus[] = ["draft", "sent", "accepted", "declined"];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EditInvoiceDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: BillingDoc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const label = doc.kind === "invoice" ? "invoice" : "estimate";
  const [status, setStatus] = useState<DocStatus>(doc.status);
  const [currency, setCurrency] = useState<CurrencyCode>(doc.currency);
  const [issuedAt, setIssuedAt] = useState(toDateInput(doc.issued_at));
  const [dueAt, setDueAt] = useState(toDateInput(doc.due_at));
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [recipientContactId, setRecipientContactId] = useState(doc.recipient_contact_id ?? "");
  const [recipientEmail, setRecipientEmail] = useState(doc.recipient_email ?? "");
  const [items, setItems] = useState<LineDraft[]>(draftsFromLineItems(doc.line_items));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [opportunityId, setOpportunityId] = useState(doc.opportunityId ?? "");
  const [shootLocation, setShootLocation] = useState(doc.shootLocation ?? "south_florida");
  const [discount, setDiscount] = useState<Discount | undefined>(doc.discount);

  // Re-sync when reopening or when the doc changes underneath.
  useEffect(() => {
    if (!open) return;
    setStatus(doc.status);
    setCurrency(doc.currency);
    setIssuedAt(toDateInput(doc.issued_at));
    setDueAt(toDateInput(doc.due_at));
    setNotes(doc.notes ?? "");
    setRecipientContactId(doc.recipient_contact_id ?? "");
    setRecipientEmail(doc.recipient_email ?? "");
    setItems(draftsFromLineItems(doc.line_items));
    setOpportunityId(doc.opportunityId ?? "");
    setShootLocation(doc.shootLocation ?? "south_florida");
    setDiscount(doc.discount);
  }, [open, doc]);

  const contacts = useMemo(() => contactsForCompany(doc.companyId), [doc.companyId]);
  const studioPass = useStudioPass(doc.companyId);

  const opportunities = useMemo(
    () => OPPORTUNITIES.filter((o) => o.companyId === doc.companyId),
    [doc.companyId],
  );
  const total = useMemo(() => draftsTotal(items), [items]);
  const vessels: VesselOption[] = useMemo(
    () =>
      listingsForCompany(doc.companyId).map((l) => ({
        id: l.id,
        label: `${getBrand(l.brandId)?.name ?? ""} ${l.model} (${l.year})`.trim(),
        lengthFt: l.lengthFt,
      })),
    [doc.companyId],
  );

  const statuses = doc.kind === "invoice" ? INVOICE_STATUSES : ESTIMATE_STATUSES;

  const save = () => {
    const validation = validateLineItems(items);
    if (validation.length > 0) {
      toast.error(validation[0].message);
      return;
    }
    const cleaned = toLineItems(items);
    if (cleaned.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const contact = contacts.find((c) => c.id === recipientContactId);
    updateDoc(doc.id, {
      status,
      currency,
      issued_at: issuedAt ? new Date(issuedAt).toISOString() : doc.issued_at,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      line_items: cleaned,
      discount,
      notes: notes.trim() || undefined,
      recipient_contact_id: contact?.id,
      recipient_contact_name: contact ? `${contact.firstName} ${contact.lastName}` : undefined,
      recipient_email: (contact?.email || recipientEmail).trim() || undefined,
      opportunityId: opportunityId || undefined,
      opportunityName: opportunityId ? getOpportunity(opportunityId)?.name : undefined,
      shootLocation,
    });
    toast.success(`${doc.number} updated`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {doc.number}</DialogTitle>
          <DialogDescription>
            Update the {label} details, line items and recipient.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DocStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR - €</SelectItem>
                  <SelectItem value="USD">USD - $</SelectItem>
                  <SelectItem value="GBP">GBP - £</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issue date</Label>
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
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
          </div>

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


          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Recipient contact</Label>
              <Select
                value={recipientContactId || "none"}
                onValueChange={(v) => {
                  const id = v === "none" ? "" : v;
                  setRecipientContactId(id);
                  const c = contacts.find((x) => x.id === id);
                  if (c?.email) setRecipientEmail(c.email);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No contact</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                      {c.email ? ` · ${c.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recipient email</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="ap@company.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Linked opportunity</Label>
            <Select
              value={opportunityId || "none"}
              onValueChange={(v) => setOpportunityId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No opportunity linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No opportunity linked</SelectItem>
                {opportunities.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.pipeline} · {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>

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
      </DialogContent>
    </Dialog>

  );
}
