import { useEffect, useState } from "react";

import { withMockFallback } from "@/lib/api/client";
import { listBrands, createApiBrand, setApiCompanyBrands, type ApiBrand } from "@/lib/api/brands";
import { usePermissions } from "@/lib/permissions";
import {
  BRANDS,
  getMockDataVersion,
  setCompanyBrands,
  subscribeMockData,
  syncBrandCatalog,
  upsertBrand,
  type Brand,
} from "@/lib/mock-data";

function toBrand(row: ApiBrand): Brand {
  return {
    id: row.id,
    name: row.name,
    manufacturerCountry: row.manufacturerCountry ?? "",
    tier: row.tier ?? "Premium",
    active: row.active ?? true,
  };
}

let loadedOnce = false;

/**
 * Managed brand catalogue. Brands come from the database (`/brands`); when the
 * API is unreachable the seeded catalogue is used so pickers keep working.
 */
export function useBrandCatalog(): {
  brands: Brand[];
  active: Brand[];
  source: "api" | "mock";
  loading: boolean;
} {
  const { apiStatus } = usePermissions();
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [loading, setLoading] = useState(false);
  const [, setVersion] = useState(getMockDataVersion());

  useEffect(() => subscribeMockData(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    if (apiStatus !== "online" || loadedOnce) return;
    let cancelled = false;
    setLoading(true);
    void withMockFallback(
      () => listBrands({ limit: 500 }),
      { data: [] as ApiBrand[], nextCursor: null },
      "listBrands",
    ).then(({ data, source: src }) => {
      if (cancelled) return;
      loadedOnce = src === "api";
      if (src === "api") syncBrandCatalog(data.data.map(toBrand));
      setSource(src);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [apiStatus]);

  const brands = [...BRANDS].sort((a, b) => a.name.localeCompare(b.name));
  return {
    brands,
    active: brands.filter((b) => b.active !== false),
    source,
    loading,
  };
}

/** Create a brand in the managed catalogue (DB first, local mirror always). */
export async function createBrand(name: string): Promise<Brand> {
  const trimmed = name.trim();
  const { data, source } = await withMockFallback(
    () => createApiBrand({ name: trimmed }),
    null as ApiBrand | null,
    "createApiBrand",
  );
  return upsertBrand(source === "api" && data ? toBrand(data) : { name: trimmed });
}

/** Persist the brands a company represents, then mirror locally. */
export async function saveCompanyBrands(
  companyId: string,
  entries: { brandId: string; exclusive: boolean }[],
) {
  await withMockFallback(
    () => setApiCompanyBrands(companyId, entries.map((e) => e.brandId)),
    null,
    "setApiCompanyBrands",
  );
  setCompanyBrands(companyId, entries);
}
