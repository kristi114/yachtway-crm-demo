import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Append-only audit trail (SOC 2). Writes an `audit_logs` row inside the caller's
 * withRole transaction. The INSERT policy allows any bound role to append, but
 * the SELECT policy is ADMIN-only — so we must NOT use Prisma's `create()`, which
 * appends `RETURNING *` and would fail the read-back for a non-admin actor
 * (Postgres 42501). A plain `$executeRaw` INSERT (no RETURNING) only exercises the
 * INSERT WITH CHECK policy, which every bound role passes.
 *
 * The `id` is generated here because the column has no DB default (Prisma's
 * cuid() is app-side and unavailable to raw SQL).
 */
export interface AuditEntry {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string; // create | update | approve | delete | send | ...
  resourceClass?: string | null;
  tableName?: string | null;
  recordId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

export async function writeAudit(tx: Prisma.TransactionClient, e: AuditEntry): Promise<void> {
  const id = randomUUID();
  const before = e.before !== undefined ? JSON.stringify(e.before) : null;
  const after = e.after !== undefined ? JSON.stringify(e.after) : null;
  await tx.$executeRaw`
    INSERT INTO audit_logs
      (id, actor_user_id, actor_role, action, resource_class, table_name, record_id, before, after, ip_address, at)
    VALUES
      (${id}, ${e.actorUserId ?? null}, ${e.actorRole ?? null}, ${e.action},
       ${e.resourceClass ?? null}, ${e.tableName ?? null}, ${e.recordId ?? null},
       ${before}::jsonb, ${after}::jsonb, ${e.ipAddress ?? null}, now())
  `;
}
