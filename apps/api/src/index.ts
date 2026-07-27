import { createApp } from "./app.js";
import { env } from "./env.js";
import { startInvoiceEmitWorker } from "./queue/emitQueue.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Start the durable invoice-emit worker (no-op unless INVOICE_EMIT_QUEUE=pgboss).
startInvoiceEmitWorker().catch((err) => {
  console.error("[api] failed to start invoice emit worker:", err);
});
