/**
 * Template-to-Prisma generator (one-off, re-runnable).
 *
 * Input : prisma/templates/fieldCatalog.json  (derived from the
 *         "Heigo Mock Dataset" Field Catalog — the SF-style CRM model).
 * Output: prisma/schema.generated.prisma       (a DRAFT to hand-tune).
 *
 * Model decisions baked in (confirmed with Kristi):
 *   - Contact       = union of "Contact — Broker" + "Contact — Buyer"
 *                     (record_type distinguishes them).
 *   - Opportunity   = the 25 fields common to all three opportunity types,
 *                     plus three 1:1 satellite tables for the type-specific
 *                     fields: EasyFundLoan, MasterCoverApplication,
 *                     StudioDetail. This keeps EasyFund/MasterCover financial
 *                     data in their own tables so "reps can't see EasyFund"
 *                     is enforceable as row-level security on one table.
 *
 * Type mapping:
 *   Text/Long Text/Email/Phone/URL/File/Text(lookup) -> String?
 *   Text(External Id) -> String? @unique   (reconciliation keys)
 *   Number  -> Decimal?      (tighten pure counts to Int by hand)
 *   Currency-> Decimal? @db.Decimal(14,2)
 *   Percent -> Decimal? @db.Decimal(6,3)
 *   Date    -> DateTime? @db.Date      DateTime -> DateTime?
 *   Checkbox-> Boolean?
 *   Picklist-> String?       Multi-Picklist -> String[]
 *   Lookup(X)-> String? scalar FK  (@relation navigation added by hand)
 *
 * Run: pnpm --filter @yachtway/api prisma:gen-schema
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, "templates/fieldCatalog.json");
const OUTPUT_PATH = resolve(__dirname, "schema.generated.prisma");

interface Row {
  object: string;
  field: string;
  label: string;
  type: string;
  source: string;
  lookupTarget: string;
  options: string;
}

const RESERVED = new Set(["id", "customFields", "createdAt", "updatedAt"]);
const BRAND_FIELDS = new Set(["authorized_brands", "brand_interests"]);

const assocManifest: string[] = [];

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/gi, (_m, c: string) => c.toUpperCase());
}

function lookupModel(type: string): string | null {
  const m = /^Lookup\(([^)]+)\)$/.exec(type);
  if (!m) return null;
  const bare = m[1].replace(/__c$/, "");
  const map: Record<string, string> = {
    User: "User",
    Account: "Account",
    Contact: "Contact",
    Listing: "Listing",
    Opportunity: "Opportunity",
    Product: "Product",
  };
  return map[bare] ?? bare;
}

function truncOptions(opts: string): string {
  const parts = opts.split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 8) return parts.join("; ");
  return `${parts.slice(0, 8).join("; ")} … (${parts.length} total)`;
}

function mapType(type: string): { prisma: string; attrs: string[] } {
  switch (type) {
    case "Text":
    case "Long Text":
    case "Email":
    case "Phone":
    case "URL":
    case "File":
    case "Text(lookup)":
      return { prisma: "String?", attrs: [] };
    case "Text(External Id)":
      return { prisma: "String?", attrs: ["@unique"] };
    case "Number":
      return { prisma: "Decimal?", attrs: [] };
    case "Currency":
      return { prisma: "Decimal?", attrs: ["@db.Decimal(14, 2)"] };
    case "Percent":
      return { prisma: "Decimal?", attrs: ["@db.Decimal(6, 3)"] };
    case "Date":
      return { prisma: "DateTime?", attrs: ["@db.Date"] };
    case "DateTime":
      return { prisma: "DateTime?", attrs: [] };
    case "Checkbox":
      return { prisma: "Boolean?", attrs: [] };
    case "Picklist":
      return { prisma: "String?", attrs: [] };
    case "Multi-Picklist":
      return { prisma: "String[]", attrs: [] };
    default:
      if (lookupModel(type)) return { prisma: "String?", attrs: [] }; // scalar FK
      return { prisma: "String?", attrs: [] };
  }
}

function emitField(row: Row, used: Set<string>, modelName: string): string[] {
  let name = snakeToCamel(row.field);
  if (RESERVED.has(name) || used.has(name)) name = `${name}Field`;
  used.add(name);

  const { prisma, attrs } = mapType(row.type);
  const allAttrs = [`@map("${row.field}")`, ...attrs];

  const lines: string[] = [];
  if (row.label) lines.push(`  /// ${row.label} [${row.type}${row.source ? ` · ${row.source}` : ""}]`);

  const lm = lookupModel(row.type);
  if (lm) {
    lines.push(`  /// FK -> ${lm} (add @relation by hand)`);
    assocManifest.push(`${modelName}.${name} -> ${lm}`);
  }
  if (row.type === "Picklist" || row.type === "Multi-Picklist") {
    if (row.options) lines.push(`  /// options: ${truncOptions(row.options)}`);
    if (BRAND_FIELDS.has(row.field)) {
      lines.push(`  /// TODO: migrate to a Brand lookup table + join (large dynamic list)`);
    }
  }
  lines.push(`  ${name.padEnd(34)} ${prisma.padEnd(11)} ${allAttrs.join(" ")}`);
  return lines;
}

function buildModel(
  modelName: string,
  table: string,
  rows: Row[],
  extraLines: string[] = [],
): string {
  const used = new Set<string>(["id"]);
  const body: string[] = ["  id                                 String      @id @default(cuid())"];
  for (const l of extraLines) body.push(l);

  for (const r of rows) {
    if (r.field === "id") continue;
    body.push(...emitField(r, used, modelName));
  }

  body.push("");
  body.push('  customFields Json?    @map("custom_fields")');
  body.push('  createdAt    DateTime @default(now()) @map("created_at")');
  body.push('  updatedAt    DateTime @updatedAt      @map("updated_at")');

  return `model ${modelName} {\n${body.join("\n")}\n\n  @@map("${table}")\n}`;
}

function dedupeByField(rows: Row[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    if (seen.has(r.field)) continue;
    seen.add(r.field);
    out.push(r);
  }
  return out;
}

function main(): void {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as { fields: Row[] };
  const byObject = new Map<string, Row[]>();
  for (const r of catalog.fields) {
    const arr = byObject.get(r.object) ?? [];
    arr.push(r);
    byObject.set(r.object, arr);
  }
  const get = (o: string): Row[] => byObject.get(o) ?? [];

  const models: string[] = [];

  // --- direct 1:1 objects ---------------------------------------------------
  const DIRECT: Array<[string, string, string]> = [
    ["User", "User", "users"],
    ["Account", "Account", "accounts"],
    ["Listing", "Listing", "listings"],
    ["Dealer Event", "DealerEvent", "dealer_events"],
    ["Broker Friendly Link", "BrokerFriendlyLink", "broker_friendly_links"],
    ["Product", "Product", "products"],
    ["Opportunity Line Item", "OpportunityLineItem", "opportunity_line_items"],
  ];
  for (const [obj, model, table] of DIRECT) {
    models.push(buildModel(model, table, get(obj)));
  }

  // --- Contact = Broker ∪ Buyer --------------------------------------------
  const contactRows = dedupeByField([...get("Contact — Broker"), ...get("Contact — Buyer")]);
  if (!contactRows.some((r) => r.field === "record_type")) {
    contactRows.unshift({
      object: "Contact",
      field: "record_type",
      label: "Record Type",
      type: "Picklist",
      source: "System",
      lookupTarget: "",
      options: "Broker; Buyer",
    });
  }
  models.push(buildModel("Contact", "contacts", contactRows));

  // --- Opportunity core + 1:1 satellites -----------------------------------
  const ef = get("Opportunity — EasyFund");
  const mc = get("Opportunity — MasterCover");
  const st = get("Opportunity — Studio");
  const keys = (arr: Row[]): Set<string> => new Set(arr.map((r) => r.field));
  const efK = keys(ef);
  const mcK = keys(mc);
  const stK = keys(st);
  const commonK = new Set([...efK].filter((k) => mcK.has(k) && stK.has(k)));

  const commonRows = ef.filter((r) => commonK.has(r.field));
  models.push(buildModel("Opportunity", "opportunities", commonRows));

  const satelliteFk = ['  /// 1:1 -> Opportunity', '  opportunityId String @unique @map("opportunity_id")'];
  assocManifest.push("EasyFundLoan.opportunityId -> Opportunity (1:1)");
  assocManifest.push("MasterCoverApplication.opportunityId -> Opportunity (1:1)");
  assocManifest.push("StudioDetail.opportunityId -> Opportunity (1:1)");

  models.push(buildModel("EasyFundLoan", "easyfund_loans", ef.filter((r) => !commonK.has(r.field)), satelliteFk));
  models.push(
    buildModel(
      "MasterCoverApplication",
      "mastercover_applications",
      mc.filter((r) => !commonK.has(r.field)),
      satelliteFk,
    ),
  );
  models.push(buildModel("StudioDetail", "studio_details", st.filter((r) => !commonK.has(r.field)), satelliteFk));

  // --- assemble -------------------------------------------------------------
  const header = [
    "// ============================================================================",
    "// GENERATED by prisma/generate-schema.ts from templates/fieldCatalog.json",
    "// This is a DRAFT. Review and hand-tune before using as the real schema.",
    "// Sensitive-domain isolation (EasyFund/MasterCover) is intentional: RLS goes",
    "// on those satellite tables in the permission step.",
    `// Generated: ${new Date().toISOString()}`,
    "// ============================================================================",
    "",
    "generator client {",
    '  provider = "prisma-client-js"',
    "}",
    "",
    "datasource db {",
    '  provider = "postgresql"',
    '  url      = env("DATABASE_URL")',
    "}",
  ].join("\n");

  const manifest = [
    "// ---------------------------------------------------------------------------",
    "// ASSOCIATIONS (belongs-to lookups; add Prisma @relation navigation by hand)",
    "// ---------------------------------------------------------------------------",
    ...assocManifest.sort().map((a) => `//   ${a}`),
  ].join("\n");

  const out = `${header}\n\n${manifest}\n\n${models.join("\n\n")}\n`;
  writeFileSync(OUTPUT_PATH, out, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`  ${models.length} models, ${assocManifest.length} associations`);
  console.log(
    `  contacts=${contactRows.length} fields, opportunity common=${commonRows.length}, ` +
      `easyfund+=${ef.filter((r) => !commonK.has(r.field)).length}, ` +
      `mastercover+=${mc.filter((r) => !commonK.has(r.field)).length}, ` +
      `studio+=${st.filter((r) => !commonK.has(r.field)).length}`,
  );
}

main();
