/**
 * Tag helpers. Tags are deduped case-insensitively: the display `name` keeps the
 * casing the user typed, while `name_key` (trimmed + collapsed whitespace +
 * lowercased) is the unique key we match/connect on — so "VIP", "vip", and
 * " Vip " all resolve to a single Tag.
 */
export const normalizeTagName = (name: string): string => name.trim().replace(/\s+/g, " ");
const tagKey = (name: string): string => normalizeTagName(name).toLowerCase();

const connectOrCreate = (tags: string[]) =>
  tags
    .filter((n) => normalizeTagName(n).length > 0)
    .map((n) => ({
      where: { nameKey: tagKey(n) },
      create: { name: normalizeTagName(n), nameKey: tagKey(n) },
    }));

/** Nested relation write for create: connect existing tags or create new ones. */
export const tagCreate = (tags?: string[] | null) =>
  tags ? { tags: { connectOrCreate: connectOrCreate(tags) } } : {};

/** Nested relation write for update: replace the record's tags with the given set. */
export const tagSet = (tags?: string[] | null) =>
  tags ? { tags: { set: [], connectOrCreate: connectOrCreate(tags) } } : {};

/** Prisma `include` that pulls tag names for read responses. */
export const tagInclude = { tags: { select: { name: true }, orderBy: { name: "asc" } } } as const;

/** Flatten an included `tags` relation to a `string[]` of names for the API response. */
export function withTagNames<T extends { tags: { name: string }[] }>(row: T): Omit<T, "tags"> & { tags: string[] } {
  const { tags, ...rest } = row;
  return { ...rest, tags: tags.map((t) => t.name) };
}
