import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPinned, Pencil, Trash2, Plus, Building2 } from "lucide-react";
import { officesForCompany, removeOffice, getContact, type Office, type Contact } from "@/lib/mock-data";

interface OfficesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  contacts: Contact[];
  onAdd: () => void;
  onEdit: (office: Office) => void;
}

export function OfficesDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  contacts,
  onAdd,
  onEdit,
}: OfficesDialogProps) {
  const offices = officesForCompany(companyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand" />
            <DialogTitle>All offices</DialogTitle>
          </div>
          <DialogDescription>
            {offices.length} office{offices.length === 1 ? "" : "s"} on file for {companyName}.
          </DialogDescription>
        </DialogHeader>

        {offices.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No offices on file. Add showrooms, branches, or service centers.
          </div>
        ) : (
          <ul className="-mx-6 -my-2 flex-1 overflow-y-auto px-6 py-2">
            {offices.map((o) => {
              const mgr = o.managerContactId ? getContact(o.managerContactId) : null;
              const addr = [o.addressLine1, o.city, o.state, o.postalCode, o.country].filter(Boolean).join(", ");
              return (
                <li
                  key={o.id}
                  className="flex items-start gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{o.label}</span>
                      {o.isHeadquarters && (
                        <Badge variant="outline" className="text-[10px]">HQ</Badge>
                      )}
                      {o.purpose && (
                        <Badge variant="outline" className="text-[10px]">{o.purpose}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {addr || "No address"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {[o.phone, o.email, mgr ? `${mgr.firstName} ${mgr.lastName}` : ""].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${o.label}`}
                      onClick={() => { onOpenChange(false); onEdit(o); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${o.label}`}
                      onClick={() => { if (confirm(`Delete office "${o.label}"?`)) removeOffice(o.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="shrink-0 border-t border-border pt-4">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => { onOpenChange(false); onAdd(); }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add office
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
