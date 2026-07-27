import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  addContact, contactsForCompany, COMPANY_ROLES,
  type Company, type CompanyRole, type ContactType,
} from "@/lib/mock-data";

const YACHT_TYPES: ContactType[] = ["Broker", "Dealer Contact", "Shipyard Contact", "Buyer"];
const FINTECH_TYPES: ContactType[] = ["Bank Contact", "Lender Contact", "Loan Applicant"];

export function AddContactDialog({
  company, open, onOpenChange, onCreated,
}: {
  company: Company;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (contactId: string, becamePrimary: boolean) => void;
}) {
  const types = company.vertical === "FinTech" ? FINTECH_TYPES : YACHT_TYPES;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactType, setContactType] = useState<ContactType>(types[0]);
  const [companyRole, setCompanyRole] = useState<CompanyRole | "">("");

  const willBePrimary = contactsForCompany(company.id).length === 0;
  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0;

  function reset() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setContactType(types[0]); setCompanyRole("");
  }

  function save() {
    if (!canSave) return;
    const created = addContact({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      contactType,
      companyRole: companyRole || null,
      companyId: company.id,
      vertical: company.vertical,
    });
    onCreated?.(created.id, willBePrimary);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>
            {willBePrimary
              ? `First contact on ${company.name} - it will be flagged as the primary contact automatically.`
              : `Linked to ${company.name}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ac-first" className="text-[11px] font-medium text-muted-foreground">
              First name <span className="text-destructive">*</span>
            </Label>
            <Input id="ac-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ac-last" className="text-[11px] font-medium text-muted-foreground">
              Last name <span className="text-destructive">*</span>
            </Label>
            <Input id="ac-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ac-email" className="text-[11px] font-medium text-muted-foreground">Email</Label>
            <Input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ac-phone" className="text-[11px] font-medium text-muted-foreground">Phone</Label>
            <Input id="ac-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Contact type</Label>
            <Select value={contactType} onValueChange={(v) => setContactType(v as ContactType)}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Company role</Label>
            <Select value={companyRole} onValueChange={(v) => setCompanyRole(v as CompanyRole)}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="Set role" /></SelectTrigger>
              <SelectContent>
                {COMPANY_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Add contact</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
