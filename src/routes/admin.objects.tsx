import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Database, Lock, Boxes } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDialog } from "@/components/admin/field-dialog";
import {
  FIELD_TYPES,
  useObjects,
  useFields,
  createObject,
  updateObject,
  deleteObject,
  deleteField,
  type CrmField,
  type CrmObject,
} from "@/lib/admin-objects";

export const Route = createFileRoute("/admin/objects")({
  component: AdminObjectsPage,
});

const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

function ObjectDialog({
  open,
  onOpenChange,
  object,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  object?: CrmObject | null;
}) {
  const isEdit = Boolean(object);
  const [label, setLabel] = useState(object?.label ?? "");
  const [plural, setPlural] = useState(object?.labelPlural ?? "");
  const [description, setDescription] = useState(object?.description ?? "");

  // Reset on open.
  useEffect(() => {
    if (open) {
      setLabel(object?.label ?? "");
      setPlural(object?.labelPlural ?? "");
      setDescription(object?.description ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Add an object name.");
      return;
    }
    if (isEdit && object) {
      updateObject(object.key, { label: label.trim(), labelPlural: plural.trim() || `${label.trim()}s`, description });
      toast.success("Object updated");
    } else {
      createObject({ label: label.trim(), labelPlural: plural.trim(), description });
      toast.success("Object created");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit object" : "New object"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Label (singular)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Survey" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Label (plural)</Label>
              <Input value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="e.g. Surveys" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="h-20" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save" : "Create object"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminObjectsPage() {
  const objects = useObjects();
  const fields = useFields();
  const [selectedKey, setSelectedKey] = useState(objects[0]?.key ?? "");
  const selected = objects.find((o) => o.key === selectedKey) ?? objects[0];

  const [objDialog, setObjDialog] = useState<{ open: boolean; object: CrmObject | null }>({ open: false, object: null });
  const [fieldDialog, setFieldDialog] = useState<{ open: boolean; field: CrmField | null }>({ open: false, field: null });

  const objectFields = useMemo(
    () => fields.filter((f) => f.objectKey === selected?.key),
    [fields, selected],
  );

  return (
    <PageBody>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        {/* Objects list */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Objects</h2>
            <Button size="sm" variant="outline" onClick={() => setObjDialog({ open: true, object: null })}>
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {objects.map((o) => {
              const count = fields.filter((f) => f.objectKey === o.key).length;
              const active = o.key === selected?.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSelectedKey(o.key)}
                  className={`flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0 ${
                    active ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  {o.custom ? <Boxes className="h-4 w-4 text-brand" /> : <Database className="h-4 w-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Object detail + fields */}
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selected.label}</h2>
                  <Badge variant={selected.custom ? "default" : "secondary"} className="gap-1">
                    {selected.custom ? "Custom" : <><Lock className="h-3 w-3" /> Standard</>}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{selected.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  API: <code>{selected.key}</code> · {objectFields.length} fields
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setObjDialog({ open: true, object: selected })}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                {selected.custom && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Delete object "${selected.label}" and all its fields?`)) {
                        deleteObject(selected.key);
                        setSelectedKey(objects[0]?.key ?? "");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Fields</h3>
              <Button size="sm" onClick={() => setFieldDialog({ open: true, field: null })}>
                <Plus className="h-4 w-4" /> New field
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>API name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {objectFields.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        {f.label}
                        {f.required && <span className="ml-1 text-destructive">*</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{f.apiName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TYPE_LABEL[f.type] ?? f.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                        {f.type === "formula" && f.formula ? (
                          <code className="line-clamp-1 block">{f.formula}</code>
                        ) : f.options ? (
                          <span className="line-clamp-1">{f.options.join(", ")}</span>
                        ) : f.lookupObject ? (
                          <span>→ {f.lookupObject}</span>
                        ) : (
                          f.helpText ?? "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Edit"
                            onClick={() => setFieldDialog({ open: true, field: f })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!f.custom}
                            className="rounded p-1 text-muted-foreground enabled:hover:bg-accent enabled:hover:text-destructive disabled:opacity-30"
                            title={f.custom ? "Delete" : "Standard fields can't be deleted"}
                            onClick={() => {
                              if (confirm(`Delete field "${f.label}"?`)) deleteField(f.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <ObjectDialog
        open={objDialog.open}
        onOpenChange={(v) => setObjDialog((s) => ({ ...s, open: v }))}
        object={objDialog.object}
      />
      {selected && (
        <FieldDialog
          open={fieldDialog.open}
          onOpenChange={(v) => setFieldDialog((s) => ({ ...s, open: v }))}
          objectKey={selected.key}
          field={fieldDialog.field}
        />
      )}
    </PageBody>
  );
}
