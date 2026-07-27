import { useEffect, useState } from "react";
import type { Company as SharedCompany, Contact as SharedContact } from "@yachtway/shared";
import { listCompanies } from "@/lib/api/companies";
import { listContacts } from "@/lib/api/contacts";
import { withMockFallback } from "@/lib/api/client";
import { usePermissions } from "@/lib/permissions";

/**
 * Fetches all companies from the live API and returns a Map keyed by id, so
 * mock-driven screens can overlay API fields (name, phone, website, tags,
 * status, timestamps) on top of their existing UI scaffolding. When the API
 * is offline the map is empty and screens transparently keep rendering the
 * mock catalogue.
 */
export function useApiCompanyOverlay(): {
  byId: Map<string, SharedCompany>;
  source: "api" | "mock";
  loading: boolean;
} {
  const { apiStatus } = usePermissions();
  const [state, setState] = useState<{
    byId: Map<string, SharedCompany>;
    source: "api" | "mock";
    loading: boolean;
  }>({ byId: new Map(), source: "mock", loading: false });

  useEffect(() => {
    if (apiStatus === "connecting" || apiStatus === "idle") return;
    if (apiStatus !== "online") {
      setState({ byId: new Map(), source: "mock", loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void withMockFallback(
      () => listCompanies({ limit: 200 }),
      { data: [] as SharedCompany[], nextCursor: null },
      "listCompanies",
    ).then(({ data, source }) => {
      if (cancelled) return;
      const map = new Map<string, SharedCompany>();
      for (const row of data.data) map.set(row.id, row);
      setState({ byId: map, source, loading: false });
    });
    return () => { cancelled = true; };
  }, [apiStatus]);

  return state;
}

export function useApiContactOverlay(): {
  byId: Map<string, SharedContact>;
  source: "api" | "mock";
  loading: boolean;
} {
  const { apiStatus } = usePermissions();
  const [state, setState] = useState<{
    byId: Map<string, SharedContact>;
    source: "api" | "mock";
    loading: boolean;
  }>({ byId: new Map(), source: "mock", loading: false });

  useEffect(() => {
    if (apiStatus === "connecting" || apiStatus === "idle") return;
    if (apiStatus !== "online") {
      setState({ byId: new Map(), source: "mock", loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void withMockFallback(
      () => listContacts({ limit: 200 }),
      { data: [] as SharedContact[], nextCursor: null },
      "listContacts",
    ).then(({ data, source }) => {
      if (cancelled) return;
      const map = new Map<string, SharedContact>();
      for (const row of data.data) map.set(row.id, row);
      setState({ byId: map, source, loading: false });
    });
    return () => { cancelled = true; };
  }, [apiStatus]);

  return state;
}
