import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Contact, ContactType, CompanyRole } from "@/lib/mock-data";
import { COMPANY_ROLES } from "@/lib/mock-data";

const CONTACT_TYPES: ContactType[] = [
  "Broker",
  "Dealer Contact",
  "Shipyard Contact",
  "Loan Applicant",
  "Bank Contact",
  "Lender Contact",
  "Buyer",
];

const LIFECYCLE_STAGES = ["Lead", "MQL", "SQL", "Customer"];

type EditableFields = Pick<
  Contact,
  "firstName" | "lastName" | "email" | "phone" | "contactType" | "lifecycleStage" | "leadSource" | "companyRole"
>;

export function EditContactDialog({
  open,
  onOpenChange,
  contact,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  onSave: (values: EditableFields) => void;
}) {
  const [values, setValues] = useState<EditableFields>({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    contactType: contact.contactType,
    lifecycleStage: contact.lifecycleStage,
    leadSource: contact.leadSource,
    companyRole: contact.companyRole ?? null,
  });

  const update = (key: keyof EditableFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value === "" ? null : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>
            Update details for{" "}
            <span className="font-medium">
              {contact.firstName} {contact.lastName}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={values.firstName} onChange={update("firstName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={values.lastName} onChange={update("lastName")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={values.email} onChange={update("email")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={values.phone} onChange={update("phone")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactType">Contact type</Label>
              <select
                id="contactType"
                value={values.contactType}
                onChange={update("contactType")}
                className="native-select h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lifecycleStage">Lifecycle stage</Label>
              <select
                id="lifecycleStage"
                value={values.lifecycleStage}
                onChange={update("lifecycleStage")}
                className="native-select h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="companyRole">Role at company</Label>
              <select
                id="companyRole"
                value={values.companyRole ?? ""}
                onChange={update("companyRole")}
                className="native-select h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">None selected</option>
                {COMPANY_ROLES.map((r: CompanyRole) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leadSource">Lead source</Label>
              <Input id="leadSource" value={values.leadSource} onChange={update("leadSource")} />
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
