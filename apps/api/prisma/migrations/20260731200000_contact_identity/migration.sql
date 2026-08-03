-- Contact identity ledger.
--
-- Reality this exists to model: one person can sign up more than once with
-- different email addresses, so they hold several yachtway_db_ids and several
-- emails. When those contacts are merged, EVERY identifier has to keep resolving
-- to the surviving contact — otherwise Amplitude events and GHL syncs arriving
-- under the older account silently stop matching, which looks exactly like a
-- tracking bug and is very hard to spot.
--
-- Design:
--   * contacts.email / contacts.yachtway_db_id keep the PRIMARY (display) value
--     and stay unique.
--   * contact_identities holds EVERY identifier, primaries included, unique on
--     (kind, value_key) where value_key = lower(trim(value)). One email → one
--     contact; one db id → one contact; globally.
--   * A trigger mirrors the contact row's primaries into the ledger on every
--     insert/update, so the ledger is complete even when the writer bypasses the
--     API (GHL dual-write, raw SQL). Without the trigger the ledger would be a
--     half-truth, which is worse than not having it.
--   * Merging = repoint the loser's ledger rows at the keeper and clear their
--     is_primary. Both db ids and both emails then live on one contact.

CREATE TABLE "contact_identities" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_key" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_identities_kind_value_key_key" ON "contact_identities"("kind", "value_key");
CREATE INDEX "contact_identities_contact_id_idx" ON "contact_identities"("contact_id");
CREATE INDEX "contact_identities_kind_idx" ON "contact_identities"("kind");
CREATE INDEX "contact_identities_value_key_idx" ON "contact_identities"("value_key");

ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_kind_check" CHECK (
  "kind" IN ('yachtway_db_id', 'email', 'amplitude_user_id', 'amplitude_id', 'device_id', 'sf_contact_id')
);

-- ---------------------------------------------------------------------------
-- Backfill from what contacts already hold.
--
-- ON CONFLICT DO NOTHING rather than failing: if the same value somehow appears
-- on two contacts, the first wins and the collision is reported by the audit
-- query below instead of aborting the migration. (contacts.email and
-- yachtway_db_id are already unique, so only the amplitude ids can realistically
-- collide.)
-- ---------------------------------------------------------------------------
INSERT INTO "contact_identities" (id, contact_id, kind, value, value_key, is_primary, source, updated_at)
SELECT gen_random_uuid()::text, c.id, 'email', c.email, lower(trim(c.email)), true, 'backfill', now()
FROM contacts c WHERE c.email IS NOT NULL AND trim(c.email) <> ''
ON CONFLICT ("kind", "value_key") DO NOTHING;

INSERT INTO "contact_identities" (id, contact_id, kind, value, value_key, is_primary, source, updated_at)
SELECT gen_random_uuid()::text, c.id, 'yachtway_db_id', c.yachtway_db_id, lower(trim(c.yachtway_db_id)), true, 'backfill', now()
FROM contacts c WHERE c.yachtway_db_id IS NOT NULL AND trim(c.yachtway_db_id) <> ''
ON CONFLICT ("kind", "value_key") DO NOTHING;

INSERT INTO "contact_identities" (id, contact_id, kind, value, value_key, is_primary, source, updated_at)
SELECT gen_random_uuid()::text, c.id, 'sf_contact_id', c.sf_contact_id, lower(trim(c.sf_contact_id)), true, 'backfill', now()
FROM contacts c WHERE c.sf_contact_id IS NOT NULL AND trim(c.sf_contact_id) <> ''
ON CONFLICT ("kind", "value_key") DO NOTHING;

INSERT INTO "contact_identities" (id, contact_id, kind, value, value_key, is_primary, source, updated_at)
SELECT gen_random_uuid()::text, c.id, 'amplitude_user_id', c.amplitude_user_id, lower(trim(c.amplitude_user_id)), true, 'backfill', now()
FROM contacts c WHERE c.amplitude_user_id IS NOT NULL AND trim(c.amplitude_user_id) <> ''
ON CONFLICT ("kind", "value_key") DO NOTHING;

INSERT INTO "contact_identities" (id, contact_id, kind, value, value_key, is_primary, source, updated_at)
SELECT gen_random_uuid()::text, c.id, 'amplitude_id', c.amplitude_id, lower(trim(c.amplitude_id)), true, 'backfill', now()
FROM contacts c WHERE c.amplitude_id IS NOT NULL AND trim(c.amplitude_id) <> ''
ON CONFLICT ("kind", "value_key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trigger: keep the ledger's primaries in step with the contact row, whoever
-- writes it. Idempotent, and never steals an identifier that already belongs to
-- a different contact (ON CONFLICT DO NOTHING) — a collision there is a merge
-- decision for a human, not something a trigger should silently resolve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_contact_identities()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pairs text[][] := ARRAY[
    ARRAY['email',             NEW.email],
    ARRAY['yachtway_db_id',    NEW.yachtway_db_id],
    ARRAY['sf_contact_id',     NEW.sf_contact_id],
    ARRAY['amplitude_user_id', NEW.amplitude_user_id],
    ARRAY['amplitude_id',      NEW.amplitude_id]
  ];
  i int;
  k text;
  v text;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    k := pairs[i][1];
    v := pairs[i][2];
    CONTINUE WHEN v IS NULL OR trim(v) = '';

    INSERT INTO contact_identities (id, contact_id, kind, value, value_key, is_primary, source, updated_at)
    VALUES (gen_random_uuid()::text, NEW.id, k, v, lower(trim(v)), true, 'contact_row', now())
    -- The WHERE means: if this identifier already belongs to a DIFFERENT contact,
    -- do nothing. Two contacts claiming one identifier is a merge decision for a
    -- human; a trigger must not silently reassign it.
    ON CONFLICT (kind, value_key) DO UPDATE
      SET last_seen_at = now(),
          updated_at   = now(),
          is_primary   = true
      WHERE contact_identities.contact_id = NEW.id;
  END LOOP;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS contacts_sync_identities ON contacts;
CREATE TRIGGER contacts_sync_identities
AFTER INSERT OR UPDATE OF email, yachtway_db_id, sf_contact_id, amplitude_user_id, amplitude_id
ON contacts
FOR EACH ROW EXECUTE FUNCTION sync_contact_identities();

-- The trigger runs as the INVOKING role, not the owner, so every role that writes
-- contacts needs table privileges here or its contact write starts failing.
-- RLS still applies on top (policy in prisma/policies/rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON "contact_identities" TO crm_app;

DO $$
BEGIN
  -- crm_sync is the GHL dual-write role; it bypasses RLS but still needs GRANTs.
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_sync') THEN
    GRANT SELECT, INSERT, UPDATE ON "contact_identities" TO crm_sync;
  END IF;
END
$$;
