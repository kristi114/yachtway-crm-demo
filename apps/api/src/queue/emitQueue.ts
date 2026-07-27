import { env } from "../env.js";
import { withRole } from "../permissions/rls.js";
import { emitToMake } from "../integrations/make.js";

/**
 * Durable outbound-emit queue (X1 hardening). By default the invoice approval
 * emits to Make INLINE (see routes/invoices.ts) — simple and fully covered by
 * tests. Set INVOICE_EMIT_QUEUE=pgboss (+ PGBOSS_DATABASE_URL, or it reuses the
 * admin DB URL) to route emits through pg-boss instead, so a Make/network blip
 * retries with backoff and never blocks or loses an approved invoice's emit.
 *
 * pg-boss is imported via a non-literal specifier so the app builds/runs without
 * the package when the queue is disabled; install it (`pnpm add pg-boss`) before
 * enabling. Worker startup lives in index.ts (not created for tests, which use
 * the inline path).
 */

const QUEUE = "xero-invoice-emit";

interface PgBossLike {
  start(): Promise<unknown>;
  send(queue: string, data: unknown, options?: unknown): Promise<string | null>;
  work(queue: string, handler: (job: unknown) => Promise<void>): Promise<string>;
  stop(): Promise<void>;
}
type PgBossCtor = new (connectionString: string) => PgBossLike;

interface EmitJob {
  invoiceId: string;
  payload: unknown;
}

let bossPromise: Promise<PgBossLike> | null = null;

export function emitQueueEnabled(): boolean {
  return env.INVOICE_EMIT_QUEUE === "pgboss";
}

function queueConnectionString(): string {
  const url = env.PGBOSS_DATABASE_URL ?? env.ADMIN_DATABASE_URL ?? env.DATABASE_URL;
  if (!url) throw new Error("pg-boss enabled but no PGBOSS_DATABASE_URL / ADMIN_DATABASE_URL / DATABASE_URL set");
  return url;
}

async function getBoss(): Promise<PgBossLike> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const spec = "pg-boss"; // non-literal keeps it out of static resolution
      const mod = (await import(spec)) as { default?: PgBossCtor } & PgBossCtor;
      const Ctor = (mod.default ?? mod) as PgBossCtor;
      const boss = new Ctor(queueConnectionString());
      await boss.start();
      return boss;
    })();
  }
  return bossPromise;
}

/** Enqueue an approved invoice's emit for durable, retried delivery. */
export async function enqueueInvoiceEmit(invoiceId: string, payload: unknown): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUE, { invoiceId, payload } satisfies EmitJob, {
    retryLimit: 5,
    retryDelay: 30, // seconds
    retryBackoff: true,
  });
}

/**
 * The unit of work: emit to Make, then reflect the outcome on the invoice under
 * the INTEGRATION role (the worker has no user context). Success → status back
 * to `queued` (awaiting the Xero callback → sent); failure → `failed` + the
 * error, then rethrow so pg-boss retries per the send policy.
 */
export async function runInvoiceEmit(invoiceId: string, payload: unknown): Promise<void> {
  try {
    await emitToMake(payload);
    await withRole("INTEGRATION", (tx) =>
      tx.invoice.update({ where: { id: invoiceId }, data: { status: "queued", syncError: null } }),
    );
  } catch (err) {
    await withRole("INTEGRATION", (tx) =>
      tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "failed", syncError: (err as Error).message.slice(0, 500) },
      }),
    ).catch(() => undefined);
    throw err; // let pg-boss retry with backoff
  }
}

/** Start the emit worker. No-op unless the queue is enabled. Call from index.ts. */
export async function startInvoiceEmitWorker(): Promise<void> {
  if (!emitQueueEnabled()) return;
  const boss = await getBoss();
  // pg-boss hands the handler a single job or a batch depending on version —
  // normalize to an array so this is version-agnostic.
  await boss.work(QUEUE, async (job: unknown) => {
    const jobs = (Array.isArray(job) ? job : [job]) as { data: EmitJob }[];
    for (const j of jobs) {
      await runInvoiceEmit(j.data.invoiceId, j.data.payload);
    }
  });
  console.log(`[api] invoice emit worker started (pg-boss queue "${QUEUE}")`);
}

/** Graceful shutdown hook (optional). */
export async function stopInvoiceEmitQueue(): Promise<void> {
  if (!bossPromise) return;
  const boss = await bossPromise;
  await boss.stop();
  bossPromise = null;
}
