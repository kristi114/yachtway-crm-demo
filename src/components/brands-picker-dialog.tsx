import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrand, saveCompanyBrands, useBrandCatalog } from "@/lib/brands";
import { brandsForCompany, type Company } from "@/lib/mock-data";

type Selected = Record<string, { exclusive: boolean }>;

/** "Brands represented" picker for dealers, brokerages and shipyards. */
export function BrandsPickerDialog({
  company,
  open,
  onOpenChange,
}: {
  company: Company;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { active, source, loading } = useBrandCatalog();
  const [selected, setSelected] = useState<Selected>({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next: Selected = {};
    for (const r of brandsForCompany(company.id)) next[r.brandId] = { exclusive: r.exclusive };
    setSelected(next);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company.id]);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q ? active.filter((b) => b.name.toLowerCase().includes(q)) : active),
    [active, q],
  );
  const exactMatch = active.some((b) => b.name.toLowerCase() === q);
  const count = Object.keys(selected).length;
  const isShipyard = company.companyType === "Shipyard";

  function toggle(id: string) {
    setSelected((s) => {
      if (s[id]) {
        const { [id]: _drop, ...rest } = s;
        return rest;
      }
      return { ...s, [id]: { exclusive: true } };
    });
  }

  async function addNew() {
    const brand = await createBrand(query);
    setSelected((s) => ({ ...s, [brand.id]: { exclusive: true } }));
    setQuery("");
  }

  async function save() {
    setSaving(true);
    await saveCompanyBrands(
      company.id,
      Object.entries(selected).map(([brandId, v]) => ({ brandId, exclusive: v.exclusive })),
    );
    setSaving(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isShipyard ? "Brands built" : "Brands represented"}</DialogTitle>
          <DialogDescription>
            Pick from the managed brand catalogue{" "}
            {loading ? "(loading...)" : source === "api" ? "(live from the database)" : "(offline catalogue)"}.
            Any brand added here is treated as exclusive to {company.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brands"
            className="pl-8"
          />
        </div>

        <div className="max-h-[46vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {results.map((b) => {
            const picked = selected[b.id];
            return (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(b.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                    picked ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background"
                  }`}
                  aria-label={picked ? `Remove ${b.name}` : `Add ${b.name}`}
                  aria-pressed={!!picked}
                >
                  {picked ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
                <button type="button" onClick={() => toggle(b.id)} className="flex-1 text-left">
                  <div className="text-[13px] font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[b.tier, b.manufacturerCountry].filter(Boolean).join(" - ")}
                  </div>
                </button>
              </div>
            );
          })}
          {results.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No brand matches that search.</div>
          ) : null}
        </div>

        {q && !exactMatch ? (
          <Button variant="outline" size="sm" className="self-start" onClick={addNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add "{query.trim()}" to the brand catalogue
          </Button>
        ) : null}

        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">{count} selected</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save brands"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
