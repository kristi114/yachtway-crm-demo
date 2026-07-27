import { describe, it, expect, afterAll } from "vitest";
import { withRls, closePool } from "./rls.js";

/**
 * Proves EasyFund isolation through the real stack: the app connects as the
 * non-superuser crm_app role, and RLS — keyed off the per-request session
 * variable — decides what each role can see. Run `pnpm --filter @yachtway/api
 * spike:apply` first to create + seed the spike schema.
 */

const CONTACT_ID = "c_buyer1";

function easyfundForContact(role: string) {
  return withRls(role, async (c) => {
    const r = await c.query("SELECT * FROM easyfund_loans WHERE contact_id = $1", [CONTACT_ID]);
    return r.rows;
  });
}

function allEasyfund(role: string) {
  return withRls(role, async (c) => {
    const r = await c.query("SELECT * FROM easyfund_loans");
    return r.rows;
  });
}

function contactById(role: string) {
  return withRls(role, async (c) => {
    const r = await c.query("SELECT * FROM contacts WHERE id = $1", [CONTACT_ID]);
    return r.rows;
  });
}

afterAll(async () => {
  await closePool();
});

describe("EasyFund RLS isolation", () => {
  it("ADMIN can read the EasyFund application", async () => {
    expect((await easyfundForContact("ADMIN")).length).toBe(1);
  });

  it("FINTECH can read the EasyFund application", async () => {
    expect((await easyfundForContact("FINTECH")).length).toBe(1);
  });

  it("SALES_REP is blocked from the EasyFund application", async () => {
    expect((await easyfundForContact("SALES_REP")).length).toBe(0);
  });

  it("SALES_REP is blocked even from a bare SELECT * on the whole table", async () => {
    expect((await allEasyfund("SALES_REP")).length).toBe(0);
  });

  it("SALES_REP can still read the general contact (not blanket-blocked)", async () => {
    expect((await contactById("SALES_REP")).length).toBe(1);
  });

  it("an unset/unauthenticated role sees nothing (default-deny)", async () => {
    expect((await easyfundForContact("")).length).toBe(0);
    expect((await contactById("")).length).toBe(0);
  });
});
