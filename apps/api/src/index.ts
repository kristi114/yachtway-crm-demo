import { createApp } from "./app.js";
import { env } from "./env.js";
import { startEmailScheduler } from "./emails/scheduler.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Scheduled / batched / RSS / smart email sends + non-opener follow-ups.
// No-op unless EMAIL_SCHEDULER_INTERVAL_SEC is set, so only the instance you
// configure actually dispatches.
startEmailScheduler();
