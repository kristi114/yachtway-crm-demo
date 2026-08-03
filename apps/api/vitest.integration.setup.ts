/**
 * SAFETY RAIL — refuse to run the integration suites against anything but a
 * local database.
 *
 * These suites create and DELETE rows. They are written to scope their cleanup to
 * `itest_*` fixtures, but they are still destructive by nature, and on 2026-08-01
 * the whole suite was run with DATABASE_URL still pointing at the Railway
 * superuser left over from a seed. Consequences: fixtures were written into
 * production, `DELETE FROM webhook_events WHERE provider = 'stripe'` wiped the
 * live Stripe idempotency ledger, and fifteen tests "failed" purely because a
 * superuser bypasses RLS — which for a while looked like a security regression.
 *
 * A shell variable is too easy to leave pointing at prod, so the check lives here
 * where it cannot be forgotten. Escape hatch for the rare deliberate case:
 * ALLOW_NON_LOCAL_INTEGRATION_DB=1.
 */
const url = process.env.DATABASE_URL ?? "";
const admin = process.env.ADMIN_DATABASE_URL ?? "";

const LOCAL = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:/]/i;

function describeTarget(raw: string): string {
  // Never echo credentials, even into a test log.
  const host = /@([^/?]*)/.exec(raw)?.[1] ?? "(unparseable)";
  return host;
}

if (process.env.ALLOW_NON_LOCAL_INTEGRATION_DB !== "1") {
  const offenders: string[] = [];
  if (url && !LOCAL.test(url)) offenders.push(`DATABASE_URL -> ${describeTarget(url)}`);
  // ADMIN_DATABASE_URL matters too: db:setup runs `prisma migrate dev` through it,
  // which is the one command that will offer to RESET a database.
  if (admin && !LOCAL.test(admin)) offenders.push(`ADMIN_DATABASE_URL -> ${describeTarget(admin)}`);

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The integration suites need a LOCAL Postgres " +
        "(see db:setup).",
    );
  }

  if (offenders.length > 0) {
    throw new Error(
      [
        "",
        "REFUSING TO RUN: the integration suites are destructive and this is not a local database.",
        ...offenders.map((o) => `  ${o}`),
        "",
        "Point them at the local dev DB, e.g.:",
        '  $env:DATABASE_URL       = "postgresql://crm_app:devpass@localhost:5433/yachtway_crm"',
        '  $env:ADMIN_DATABASE_URL = "postgresql://crm:devpass@localhost:5433/yachtway_crm"',
        "",
        "If you really mean it, set ALLOW_NON_LOCAL_INTEGRATION_DB=1.",
        "",
      ].join("\n"),
    );
  }
}
