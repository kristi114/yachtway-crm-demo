import type { Prisma } from "@prisma/client";
import type { Role, SystemRole } from "@yachtway/shared";
import { prisma } from "../db.js";

/**
 * Runs `fn` inside a transaction with the request's role bound to the Postgres
 * session variable `app.current_role`. The RLS policies read that variable, so
 * every query inside the callback is filtered by the database itself — even a
 * raw `SELECT *`. This is the single seam the API middleware plugs into:
 * resolve JWT -> role -> set_config.
 *
 * set_config(..., is_local = true) is transaction-scoped and parameterized, so
 * the role string can never be a SQL-injection vector.
 */
export function withRole<T>(
  role: Role | SystemRole,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_role', ${role}, true)`;
    return fn(tx);
  });
}
