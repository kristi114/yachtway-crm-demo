import {
  type EffectivePermissions,
  type PermissionGrant,
  ResourceClassSchema,
  type Role,
} from "@yachtway/shared";
import { prisma } from "../db.js";

interface GrantRow {
  resource_class: string;
  can_read: boolean;
  can_write: boolean;
}

/**
 * Loads the effective permissions for a role straight from the DB grant tables
 * (the source of truth the RLS policies also read). Unknown resource classes
 * are dropped defensively so the payload always matches the shared contract.
 */
export async function loadEffectivePermissions(
  userId: string,
  role: Role,
): Promise<EffectivePermissions> {
  const rows = await prisma.$queryRaw<GrantRow[]>`
    SELECT g.resource_class, g.can_read, g.can_write
    FROM permission_grants g
    JOIN roles r ON r.id = g.role_id
    WHERE r.key = ${role} AND r.is_active
    ORDER BY g.resource_class
  `;

  const grants: PermissionGrant[] = rows
    .filter((r) => ResourceClassSchema.safeParse(r.resource_class).success)
    .map((r) => ({
      resource: r.resource_class as PermissionGrant["resource"],
      read: r.can_read,
      write: r.can_write,
    }));

  return { userId, role, grants };
}
