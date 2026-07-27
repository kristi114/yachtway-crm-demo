import pg from "pg";
import type { PoolClient } from "pg";

const { Pool } = pg;

// Load apps/api/.env into process.env (Node >= 20.12 built-in; no dotenv dep).
try {
  process.loadEnvFile();
} catch {
  // no .env present — rely on ambient environment
}

// The API connects as the least-privilege crm_app role (RLS applies to it).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Runs `fn` inside a transaction with the request's role bound to the Postgres
 * session variable `app.current_role`. RLS policies read that variable, so
 * every query in the callback is filtered by the database itself — even a raw
 * `SELECT *` with no WHERE. This is the exact seam the real API middleware
 * (and later WorkOS) plugs into: resolve JWT -> role -> set_config.
 *
 * set_config(..., is_local = true) is the parameterizable form of SET LOCAL,
 * so the role string can never be a SQL-injection vector.
 */
export async function withRls<T>(
  role: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_role', $1, true)", [role]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
