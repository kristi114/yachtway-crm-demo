import { PrismaClient } from "@prisma/client";
import {
  BRAND_SEED,
  brandKey,
  DEFAULT_ROLE_GRANTS,
  PIPELINE_SEED,
  RoleSchema,
  SYSTEM_ROLE_GRANTS,
  SystemRoleSchema,
} from "@yachtway/shared";

/**
 * Seeds roles + permission grants from the single source of truth in
 * @yachtway/shared (DEFAULT_ROLE_GRANTS). Idempotent: upserts, and prunes any
 * grant no longer in the matrix so the DB never drifts from the contract.
 * Run with `pnpm --filter @yachtway/api prisma:seed` (or `prisma db seed`).
 */
const prisma = new PrismaClient();

const ROLE_META: Record<string, { name: string; description: string }> = {
  SALES_REP: { name: "Sales Rep", description: "Sales team — companies, contacts, general conversations. No financing data." },
  FINTECH: { name: "Fintech", description: "EasyFund / MasterCover team — financing applications and financing conversations." },
  MARKETING: { name: "Marketing", description: "Marketing team — read CRM, own analytics." },
  ADMIN: { name: "Admin", description: "Full access to every resource class." },
  INTEGRATION: {
    name: "Integration",
    description: "System actor for provider webhooks/inbound (Mailgun, Gmail). Not a user role.",
  },
};

async function seedRole(key: string, grants: { resource: string; read: boolean; write: boolean }[]): Promise<void> {
  const meta = ROLE_META[key];
  const role = await prisma.role.upsert({
    where: { key },
    update: { name: meta.name, description: meta.description, isActive: true },
    create: { key, name: meta.name, description: meta.description },
  });
  for (const g of grants) {
    await prisma.permissionGrant.upsert({
      where: { roleId_resourceClass: { roleId: role.id, resourceClass: g.resource } },
      update: { canRead: g.read, canWrite: g.write },
      create: { roleId: role.id, resourceClass: g.resource, canRead: g.read, canWrite: g.write },
    });
  }
  // Prune grants that are no longer part of the matrix for this role.
  await prisma.permissionGrant.deleteMany({
    where: { roleId: role.id, resourceClass: { notIn: grants.map((g) => g.resource) } },
  });
  console.log(`  ${key}: ${grants.length} grants`);
}

async function main(): Promise<void> {
  for (const key of RoleSchema.options) {
    await seedRole(key, DEFAULT_ROLE_GRANTS[key]);
  }
  // System actors (INTEGRATION) — not user roles, but need DB grants so webhooks
  // can write under RLS via withRole().
  for (const key of SystemRoleSchema.options) {
    await seedRole(key, SYSTEM_ROLE_GRANTS[key]);
  }
  console.log("Seeded roles + permission grants from @yachtway/shared (user + system).");

  await seedPipelines();
  await seedBrands();
}

/**
 * Seeds the brands picklist from @yachtway/shared BRAND_SEED. Idempotent: upserts
 * by the normalized dedupe key, so re-runs never duplicate and filling BRAND_SEED
 * later just adds the missing brands. Runs as ADMIN (brands write is ADMIN-gated
 * under RLS). Preserves sort order by array position.
 */
async function seedBrands(): Promise<void> {
  if (BRAND_SEED.length === 0) {
    console.log("No brands to seed (BRAND_SEED is empty — awaiting the authoritative list).");
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_role', 'ADMIN', true)`;
    for (const [i, name] of BRAND_SEED.entries()) {
      const key = brandKey(name);
      await tx.brand.upsert({
        where: { nameKey: key },
        update: { name, active: true, sortOrder: i },
        create: { name, nameKey: key, active: true, sortOrder: i },
      });
    }
  });
  console.log(`Seeded ${BRAND_SEED.length} brands from @yachtway/shared BRAND_SEED.`);
}

/**
 * Seeds the 13 opportunity pipelines and their stages from PIPELINE_SEED.
 * Idempotent: pipelines/stages are upserted by their natural keys and stage
 * position/flags re-synced, so re-running reconciles the DB to the catalog
 * without duplicating rows or orphaning renamed stages.
 */
async function seedPipelines(): Promise<void> {
  // pipelines / pipeline_stages are ADMIN-write under RLS. The seed connects as
  // crm_app, so bind the ADMIN role for the session (transaction-local, like the
  // API's withRole) or the policy would reject the writes. A two-position swap
  // (e.g. reordering pipelines) can transiently collide on the
  // (pipeline_id, position) unique index, so stage positions are cleared first,
  // then reassigned — all inside one transaction.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_role', 'ADMIN', true)`;

    // Deactivate pipelines dropped from the catalog (e.g. merged away) rather
    // than delete — non-destructive, keeps any opportunities' FK intact; the API
    // lists only isActive pipelines so they disappear from the UI.
    await tx.pipeline.updateMany({
      where: { key: { notIn: PIPELINE_SEED.map((p) => p.key) } },
      data: { isActive: false },
    });

    for (const [i, p] of PIPELINE_SEED.entries()) {
      const pipeline = await tx.pipeline.upsert({
        where: { key: p.key },
        update: {
          name: p.name,
          displayOrder: i,
          sensitivityClass: p.sensitivityClass ?? null,
          lostReasons: p.lostReasons ?? [],
          isActive: true,
        },
        create: {
          key: p.key,
          name: p.name,
          displayOrder: i,
          sensitivityClass: p.sensitivityClass ?? null,
          lostReasons: p.lostReasons ?? [],
        },
      });

      // Park existing positions out of range so re-ordering can't collide on the
      // (pipeline_id, position) unique index mid-update.
      await tx.pipelineStage.updateMany({
        where: { pipelineId: pipeline.id },
        data: { position: { increment: 1000 } },
      });

      for (const [pos, s] of p.stages.entries()) {
        await tx.pipelineStage.upsert({
          where: { pipelineId_key: { pipelineId: pipeline.id, key: s.key } },
          // isWon is vestigial (outcome now lives on Opportunity.status); clear it.
          update: { name: s.name, position: pos, isClosed: s.isClosed ?? false, isWon: null },
          create: {
            pipelineId: pipeline.id,
            key: s.key,
            name: s.name,
            position: pos,
            isClosed: s.isClosed ?? false,
            isWon: null,
          },
        });
      }

      // Prune stages no longer in the catalog for this pipeline.
      await tx.pipelineStage.deleteMany({
        where: { pipelineId: pipeline.id, key: { notIn: p.stages.map((s) => s.key) } },
      });

      console.log(`  pipeline ${p.key}: ${p.stages.length} stages${p.sensitivityClass ? ` (${p.sensitivityClass})` : ""}`);
    }
    // Generous timeout: ~60 upserts round-tripping over the Railway public proxy
    // can exceed Prisma's 5s interactive-transaction default (P2028).
  }, { timeout: 120_000, maxWait: 20_000 });
  console.log(`Seeded ${PIPELINE_SEED.length} pipelines from @yachtway/shared PIPELINE_SEED.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
