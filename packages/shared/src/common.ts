import { z } from "zod";

/** Primary key (cuid). */
export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

/** Contact record types (SF-style discriminator). */
export const RecordTypeSchema = z.enum(["Broker", "Buyer"]);
export type RecordType = z.infer<typeof RecordTypeSchema>;

/** ISO-8601 timestamp on the wire. */
export const IsoDateSchema = z.string().datetime({ offset: true });

/** Cursor pagination query. */
export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Standard list envelope. */
export function listResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });
}
