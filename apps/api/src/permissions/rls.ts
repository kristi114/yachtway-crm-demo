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
  opts?: WithRoleOptions,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_role', ${role}, true)`;
    // Identity, for policies that are per-AUTHOR rather than per-role: a private
    // note is readable by the person who wrote it and nobody else, which no role
    // check can express. Empty string when absent, since set_config rejects NULL
    // — and an empty value can never equal a real author id, so the default is
    // deny. Callers that don't pass a userId keep their previous behaviour
    // exactly, because no existing policy reads this variable.
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${opts?.userId ?? ""}, true)`;
    return fn(tx);
  });
}

export interface WithRoleOptions {
  /** Auth subject (WorkOS sub / dev shim id) of the caller. */
  userId?: string | null;
}
