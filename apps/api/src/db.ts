import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the API. Connects as the least-privilege `crm_app`
 * role (DATABASE_URL), so every query is subject to the RLS policies in
 * prisma/policies/rls.sql. Role is bound per-request via `withRole`.
 */
export const prisma = new PrismaClient();
