import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load apps/api/.env into process.env (Node >= 20.12 built-in; no dotenv dep).
try {
  process.loadEnvFile();
} catch {
  // no .env present — rely on ambient environment
}

/**
 * Applies prisma/policies/rls.sql as the OWNER/superuser (ADMIN_DATABASE_URL),
 * because ENABLE/FORCE ROW LEVEL SECURITY and CREATE POLICY require ownership.
 * Prisma manages tables; this manages the RLS layer. Idempotent — run after
 * every `prisma migrate`.
 */
async function main(): Promise<void> {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error("ADMIN_DATABASE_URL is not set (needs the owner/superuser connection).");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const sql = readFileSync(resolve(__dirname, "policies/rls.sql"), "utf8");
    await client.query(sql);
    console.log("RLS policies applied (functions, ENABLE/FORCE RLS, per-resource policies).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
