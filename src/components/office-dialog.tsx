import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addOffice, updateOffice, OFFICE_PURPOSES, type Office, type OfficePurpose, type Contact } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  office?: Office;              // if provided, edit mode
  contacts: Contact[];
};

const empty = (companyId: string): Omit<Office, "id"> => ({
  companyId, label: "", isHeadquarters: false, purpose: "Sales",
  addressLine1: "", addressLine2: "", city: "", state: "",
  postalCode: "", country: "", phone: "", email: "", managerContactId: null,
});


export function OfficeDialog({ open, onOpenChange, companyId, office, contacts }: Props) {
  const [v, setV] = useState<Omit<Office, "id">>(() => (office ? { ...office } : empty(companyId)));

  const set = <K extends keyof Omit<Office, "id">>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setV((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.label.trim()) return;
    if (office) updateOffice(office.id, v);
    else addOffice({ ...v, companyId });
    onOpenChange(false);
    if (!office) setV(empty(companyId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{office ? "Edit office" : "Add office"}</DialogTitle>
          <DialogDescription>
            Track additional locations for this account - showrooms, branch offices, service centers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="label">Office label *</Label>
              <Input id="label" value={v.label} onChange={set("label")} placeholder="Miami showroom" required />
            </div>
            <label className="mb-1.5 flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={v.isHeadquarters} onChange={set("isHeadquarters")} />
              <span>HQ</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purpose">Location used for *</Label>
            <select
              id="purpose"
              value={v.purpose}
              onChange={(e) => setV((s) => ({ ...s, purpose: e.target.value as OfficePurpose }))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {OFFICE_PURPOSES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>


          <div className="space-y-1.5">
            <Label htmlFor="addressLine1">Address line 1</Label>
            <Input id="addressLine1" value={v.addressLine1} onChange={set("addressLine1")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addressLine2">Address line 2</Label>
            <Input id="addressLine2" value={v.addressLine2} onChange={set("addressLine2")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={v.city} onChange={set("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State / Region</Label>
              <Input id="state" value={v.state} onChange={set("state")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input id="postalCode" value={v.postalCode} onChange={set("postalCode")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={v.country} onChange={set("country")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={v.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={v.email} onChange={set("email")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manager">Office manager</Label>
            <select
              id="manager"
              value={v.managerContactId ?? ""}
              onChange={(e) => setV((s) => ({ ...s, managerContactId: e.target.value || null }))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">None selected</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.email}</option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{office ? "Save office" : "Add office"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
