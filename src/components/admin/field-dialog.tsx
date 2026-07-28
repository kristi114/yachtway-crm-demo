import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormulaBuilder } from "@/components/admin/formula-builder";
import {
  FIELD_TYPES,
  createField,
  updateField,
  toApiName,
  useObjects,
  useFields,
  type CrmField,
  type FieldType,
  type FormulaReturnType,
} from "@/lib/admin-objects";

const CHOICE_TYPES: FieldType[] = ["picklist", "multipicklist"];

export function FieldDialog({
  open,
  onOpenChange,
  objectKey,
  field,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objectKey: string;
  field?: CrmField | null;
}) {
  const objects = useObjects();
  const allFields = useFields();
  const isEdit = Boolean(field);

  const [label, setLabel] = useState("");
  const [apiName, setApiName] = useState("");
  const [apiTouched, setApiTouched] = useState(false);
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [helpText, setHelpText] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [lookupObject, setLookupObject] = useState("");
  const [formula, setFormula] = useState("");
  const [formulaReturnType, setFormulaReturnType] = useState<FormulaReturnType>("text");

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? "");
    setApiName(field?.apiName ?? "");
    setApiTouched(Boolean(field));
    setType(field?.type ?? "text");
    setRequired(field?.required ?? false);
    setHelpText(field?.helpText ?? "");
    setOptionsText((field?.options ?? []).join("\n"));
    setLookupObject(field?.lookupObject ?? "");
    setFormula(field?.formula ?? "");
    setFormulaReturnType(field?.formulaReturnType ?? "text");
  }, [open, field]);

  // Auto-derive API name from label until the user edits it directly.
  useEffect(() => {
    if (!apiTouched) setApiName(toApiName(label));
  }, [label, apiTouched]);

  const otherFields = useMemo(
    () => allFields.filter((f) => f.objectKey === objectKey && f.id !== field?.id),
    [allFields, objectKey, field],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Add a field label.");
      return;
    }
    const base = {
      objectKey,
      label: label.trim(),
      apiName: apiName.trim() || toApiName(label),
      type,
      required: type === "formula" ? false : required,
      helpText: helpText.trim() || undefined,
      options: CHOICE_TYPES.includes(type)
        ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
        : undefined,
      lookupObject: type === "lookup" ? lookupObject || undefined : undefined,
      formula: type === "formula" ? formula : undefined,
      formulaReturnType: type === "formula" ? formulaReturnType : undefined,
    };
    if (isEdit && field) {
      updateField(field.id, base);
      toast.success("Field updated", { description: base.label });
    } else {
      createField(base);
      toast.success("Field created", { description: base.label });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit field" : "New field"}</DialogTitle>
          <DialogDescription>
            {field && !field.custom
              ? "Standard field — label, help and options are editable."
              : "Define the field, its type, and behaviour."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fld-label">Field label</Label>
              <Input id="fld-label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fld-api">API name</Label>
              <Input
                id="fld-api"
                value={apiName}
                onChange={(e) => {
                  setApiTouched(true);
                  setApiName(e.target.value);
                }}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Data type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)} disabled={Boolean(field && !field.custom)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {CHOICE_TYPES.includes(type) && (
            <div className="space-y-1.5">
              <Label htmlFor="fld-options">Options (one per line)</Label>
              <Textarea
                id="fld-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"Option A\nOption B\nOption C"}
                className="h-24"
              />
            </div>
          )}

          {type === "lookup" && (
            <div className="space-y-1.5">
              <Label>Related object</Label>
              <Select value={lookupObject} onValueChange={setLookupObject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an object" />
                </SelectTrigger>
                <SelectContent>
                  {objects.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "formula" && (
            <FormulaBuilder
              value={formula}
              onChange={setFormula}
              returnType={formulaReturnType}
              onReturnTypeChange={setFormulaReturnType}
              fields={otherFields}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fld-help">Help text</Label>
            <Input id="fld-help" value={helpText} onChange={(e) => setHelpText(e.target.value)} placeholder="Shown as a tooltip on the field" />
          </div>

          {type !== "formula" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(Boolean(v))} />
              Required
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save field" : "Create field"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
