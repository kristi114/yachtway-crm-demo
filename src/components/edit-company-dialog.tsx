import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Company, Contact } from "@/lib/mock-data";
import type { CurrencyCode } from "@/lib/currency";
import { CURRENCIES } from "@/lib/currency";

type EditableFields = Pick<
  Company,
  "phone" | "website" | "yachtwayDealerPage" | "billingCity" | "billingState" | "billingCountry" | "customWebsiteEnabled" | "currency" | "primaryContactId"
>;

export function EditCompanyDialog({
  open,
  onOpenChange,
  company,
  contacts,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company;
  contacts: Contact[];
  onSave: (values: EditableFields) => void;
}) {
  const [values, setValues] = useState<EditableFields>({
    phone: company.phone,
    website: company.website,
    yachtwayDealerPage: company.yachtwayDealerPage,
    billingCity: company.billingCity,
    billingState: company.billingState,
    billingCountry: company.billingCountry,
    customWebsiteEnabled: company.customWebsiteEnabled,
    currency: company.currency,
    primaryContactId: company.primaryContactId ?? "",
  });

  const update = (key: keyof EditableFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...values, primaryContactId: values.primaryContactId || null });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit company details</DialogTitle>
          <DialogDescription>
            Update address and contact info for <span className="font-medium">{company.name}</span>. The company name cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Company name (read-only)</Label>
            <Input value={company.name} disabled className="bg-muted/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Main phone</Label>
              <Input id="phone" value={values.phone} onChange={update("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">URL</Label>
              <Input id="website" value={values.website} onChange={update("website")} placeholder="example.com" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="primaryContactId">Main contact</Label>
            <select
              id="primaryContactId"
              value={values.primaryContactId ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, primaryContactId: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">None selected</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName} · {c.email}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="yachtwayDealerPage">YachtWay profile URL</Label>
            <Input id="yachtwayDealerPage" value={values.yachtwayDealerPage} onChange={update("yachtwayDealerPage")} placeholder="YachtWay.com/dealer/..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Account currency</Label>
              <select
                id="currency"
                value={values.currency}
                onChange={(e) => setValues((v) => ({ ...v, currency: e.target.value as CurrencyCode }))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code} - {c.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                All deals, listings and revenue for this account display in this currency.
              </p>
            </div>
            <label className="mt-6 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={values.customWebsiteEnabled}
                onChange={update("customWebsiteEnabled")}
              />
              <span>Uses YachtWay Custom Website</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="billingCity">City</Label>
            <Input id="billingCity" value={values.billingCity} onChange={update("billingCity")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="billingState">State / Region</Label>
              <Input id="billingState" value={values.billingState} onChange={update("billingState")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billingCountry">Country</Label>
              <Input id="billingCountry" value={values.billingCountry} onChange={update("billingCountry")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
