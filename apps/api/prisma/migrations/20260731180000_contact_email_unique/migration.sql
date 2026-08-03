-- contacts.email becomes UNIQUE.
--
-- Why: Amplitude's user_id is the user's email address, so email is the join key
-- between product analytics and the CRM. A non-unique key would make that join
-- ambiguous — two contacts with the same address and no way to say which one an
-- event belongs to.
--
-- Three steps, in this order and for a reason:
--
--   1. REFUSE TO PROCEED if duplicates exist. The check is case-INSENSITIVE,
--      because step 2 lower-cases everything and would otherwise turn
--      'A@x.com' + 'a@x.com' into a hard constraint violation halfway through the
--      migration. Failing first, with the offending addresses named, is far
--      kinder than failing during index creation.
--   2. Normalise existing values to lower(trim(email)).
--   3. Add both indexes: the plain unique one Prisma models, plus a unique index
--      on lower(email) so a writer that bypasses the API (the GHL dual-write, or
--      raw SQL) cannot introduce a case-variant duplicate either.
--
-- NOTE for `prisma migrate dev`: the lower(email) index is a functional index,
-- which Prisma cannot express in schema.prisma, so a dev shadow-database compare
-- may report it as drift. `migrate deploy` (what we run) does not compare, so
-- production is unaffected. Do not "fix" the drift by dropping the index.

-- ---------------------------------------------------------------------------
-- 1. Guard: abort with a readable message if duplicates exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_count integer;
  examples  text;
BEGIN
  SELECT count(*), string_agg(DISTINCT key, ', ' ORDER BY key)
    INTO dup_count, examples
  FROM (
    SELECT lower(trim(email)) AS key
    FROM contacts
    WHERE email IS NOT NULL AND trim(email) <> ''
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
  ) d;

  IF COALESCE(dup_count, 0) > 0 THEN
    RAISE EXCEPTION
      'contacts.email cannot be made unique: % duplicated address(es) still present: %. Merge or clear them first — see CRM-Contact-Email-Dedupe.md.',
      dup_count, left(examples, 500);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Canonicalise what's already there.
-- ---------------------------------------------------------------------------
UPDATE "contacts"
   SET "email" = lower(trim("email"))
 WHERE "email" IS NOT NULL
   AND "email" <> lower(trim("email"));

-- Blank strings are not addresses; NULL them so they don't collide with each
-- other (Postgres allows many NULLs in a unique index, but only one '').
UPDATE "contacts" SET "email" = NULL WHERE "email" IS NOT NULL AND trim("email") = '';

-- ---------------------------------------------------------------------------
-- 3. Constraints.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts"("email");

-- Defence against non-API writers: case-insensitive uniqueness.
CREATE UNIQUE INDEX "contacts_email_lower_key" ON "contacts" (lower("email"));
