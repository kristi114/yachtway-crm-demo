import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { withRole } from "./rls.js";

/**
 * Proves the permission engine end-to-end against the REAL migrated tables: the
 * app connects as the least-privilege crm_app role, and RLS — reading the grant
 * tables via the per-request session variable — decides what each role sees.
 *
 * Requires the local Postgres up and `pnpm db:setup` already run (migrate +
 * policies + seed). Kept out of the default unit suite; run with
 * `pnpm --filter @yachtway/api test:integration`.
 */

const OPP_ID = "itest_opp_ef";
const EF_ID = "itest_ef_loan";
const CONTACT_ID = "itest_contact";

async function seed(): Promise<void> {
  // Seed as ADMIN (holds every write grant) so the fixture lands past RLS.
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, created_at, updated_at)
      VALUES (${OPP_ID}, 'RLS integration opp', now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO easyfund_loans (id, opportunity_id, credit_score, monthly_income, created_at, updated_at)
      VALUES (${EF_ID}, ${OPP_ID}, 780, 18500.00, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO contacts (id, record_type, first_name, email, created_at, updated_at)
      VALUES (${CONTACT_ID}, 'Buyer', 'Dana', 'dana@example.com', now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
}

async function countEasyfund(role: "SALES_REP" | "FINTECH" | "MARKETING" | "ADMIN"): Promise<number> {
  return withRole(role, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM easyfund_loans WHERE id = ${EF_ID}`;
    return rows.length;
  });
}

async function countContact(role: "SALES_REP" | "FINTECH" | "MARKETING" | "ADMIN"): Promise<number> {
  return withRole(role, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM contacts WHERE id = ${CONTACT_ID}`;
    return rows.length;
  });
}

beforeAll(seed);

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE id = ${EF_ID}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id = ${OPP_ID}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CONTACT_ID}`;
  });
  await prisma.$disconnect();
});

describe("EasyFund RLS isolation (real schema)", () => {
  it("ADMIN can read the EasyFund loan", async () => {
    expect(await countEasyfund("ADMIN")).toBe(1);
  });

  it("FINTECH can read the EasyFund loan", async () => {
    expect(await countEasyfund("FINTECH")).toBe(1);
  });

  it("SALES_REP is blocked from the EasyFund loan", async () => {
    expect(await countEasyfund("SALES_REP")).toBe(0);
  });

  it("MARKETING is blocked from the EasyFund loan", async () => {
    expect(await countEasyfund("MARKETING")).toBe(0);
  });

  it("SALES_REP can still read the general contact (not blanket-blocked)", async () => {
    expect(await countContact("SALES_REP")).toBe(1);
  });

  it("an unauthenticated connection (no app.current_role) sees nothing — default-deny", async () => {
    // No withRole => the session variable is never set => policies match nothing.
    const ef = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM easyfund_loans WHERE id = ${EF_ID}`;
    const contacts = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM contacts WHERE id = ${CONTACT_ID}`;
    expect(ef.length).toBe(0);
    expect(contacts.length).toBe(0);
  });
});
