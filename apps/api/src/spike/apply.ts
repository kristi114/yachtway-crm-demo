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

// Applies the spike schema + seed as the SUPERUSER (crm), which can create the
// crm_app role, the tables, the RLS policies, and seed past RLS.
async function main(): Promise<void> {
  const adminUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("ADMIN_DATABASE_URL is not set (needs the superuser connection).");
  }
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const schema = readFileSync(resolve(__dirname, "../../prisma/spike/schema.sql"), "utf8");
    const seed = readFileSync(resolve(__dirname, "../../prisma/spike/seed.sql"), "utf8");
    await client.query(schema);
    await client.query(seed);
    console.log("Spike schema + seed applied (tables, crm_app role, RLS policies, 1 contact + 1 EasyFund row).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
