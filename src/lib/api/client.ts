import { z, type ZodTypeAny } from "zod";
import { API_BASE_URL, authHeaders, getAccessTokenForApi } from "./config";


/**
 * Thin typed fetch wrapper around apps/api. Injects the dev role header,
 * validates responses with zod, and normalizes errors so screens can
 * uniformly `catch` and fall back to mock data if the API is offline.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiOfflineError extends Error {
  constructor(cause?: unknown) {
    super("API unreachable");
    this.name = "ApiOfflineError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

interface RequestOptions<Res extends ZodTypeAny> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  response?: Res;
  signal?: AbortSignal;
}

export async function apiFetch<Res extends ZodTypeAny>(
  path: string,
  opts: RequestOptions<Res> = {},
): Promise<Res extends ZodTypeAny ? z.infer<Res> : unknown> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "accept": "application/json",
  };
  // Real auth: a fresh (auto-refreshed) WorkOS AuthKit access token. When no
  // provider is registered we're in local demo mode and fall back to the dev
  // role header shim the API still accepts under AUTH_MODE=dev.
  const token = await getAccessTokenForApi();
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  } else {
    headers["x-crm-role"] = authHeaders.role;
    if (authHeaders.userId) headers["x-crm-user-id"] = authHeaders.userId;
  }
  if (opts.body !== undefined) headers["content-type"] = "application/json";


  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "omit",
    });
  } catch (err) {
    // Network failure, CORS, DNS - treat as offline so callers can fall back.
    throw new ApiOfflineError(err);
  }

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* ignore */ }
    const msg = (body as { error?: string } | undefined)?.error ?? res.statusText;
    throw new ApiError(res.status, msg, body);
  }

  if (res.status === 204) return undefined as never;
  const json = await res.json();
  if (opts.response) return opts.response.parse(json) as never;
  return json as never;
}

/** Wrapper for `{ data, nextCursor }` list envelopes. */
export function listEnvelope<T extends ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable().optional(),
    total: z.number().int().nonnegative().optional(),
  });
}

/**
 * Convenience for screens: run an API call and, on any failure (offline,
 * 4xx, 5xx, validation), return `fallback` instead. Errors are logged for
 * visibility. Screens still keep mock data for now, per the integration
 * brief - real endpoints exist for Companies, Contacts, EasyFund, and
 * MasterCover only.
 */
export async function withMockFallback<T>(
  call: () => Promise<T>,
  fallback: T,
  context?: string,
): Promise<{ data: T; source: "api" | "mock"; error?: Error }> {
  try {
    const data = await call();
    return { data, source: "api" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[api] ${context ?? "call"} fell back to mock:`, error.message);
    }
    return { data: fallback, source: "mock", error };
  }
}
