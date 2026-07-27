import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createBrand, useBrandCatalog } from "@/lib/brands";
import { companiesForBrand, deleteBrand, setBrandActive } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/brands")({
  head: () => ({
    meta: [
      { title: "Brands - YachtWay CRM admin" },
      {
        name: "description",
        content:
          "Manage the YachtWay brand catalogue: add brands, deactivate retired ones, and see which dealers and shipyards represent each brand.",
      },
      { property: "og:title", content: "Brands - YachtWay CRM admin" },
      {
        property: "og:description",
        content: "Manage the managed brand catalogue used by dealer and shipyard profiles.",
      },
    ],
  }),
  component: AdminBrands,
});

function AdminBrands() {
  const { brands, source, loading } = useBrandCatalog();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const q = search.trim().toLowerCase();
  const rows = q ? brands.filter((b) => b.name.toLowerCase().includes(q)) : brands;

  return (
    <div className="space-y-6">
      <section className="rounded-sm border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Brand catalogue</h2>
            <p className="text-xs text-muted-foreground">
              {brands.length} brands{" "}
              {loading
                ? "(loading...)"
                : source === "api"
                  ? "loaded from the database"
                  : "from the offline catalogue - the database copy takes over when the API is reachable"}
              . Dealer, brokerage and shipyard profiles pick from this list instead of typing free text.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands"
              className="h-8 w-full max-w-[220px] text-xs"
            />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New brand name"
              className="h-8 w-full max-w-[200px] text-xs"
            />
            <Button
              size="sm"
              disabled={!name.trim()}
              onClick={async () => {
                await createBrand(name);
                setName("");
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add brand
            </Button>
          </div>
        </header>

        <table className="w-full text-[13px]">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">Brand</th>
              <th className="px-4 py-2 text-left font-medium">Tier</th>
              <th className="px-4 py-2 text-left font-medium">Country</th>
              <th className="px-4 py-2 text-left font-medium">Represented by</th>
              <th className="px-4 py-2 text-left font-medium">Active</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((b) => {
              const companies = companiesForBrand(b.id);
              return (
                <tr key={b.id}>
                  <td className="px-4 py-2.5 font-medium">{b.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{b.tier}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{b.manufacturerCountry || "-"}</td>
                  <td className="px-4 py-2.5">
                    {companies.length ? (
                      <div className="flex flex-wrap gap-1">
                        {companies.slice(0, 3).map((c) => (
                          <Badge key={c.id} variant="secondary" className="text-[11px]">
                            {c.name}
                          </Badge>
                        ))}
                        {companies.length > 3 ? (
                          <span className="text-xs text-muted-foreground">
                            +{companies.length - 3} more
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Switch
                      checked={b.active !== false}
                      onCheckedChange={(v) => setBrandActive(b.id, v)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteBrand(b.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-xs text-muted-foreground">
                  No brand matches that search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
