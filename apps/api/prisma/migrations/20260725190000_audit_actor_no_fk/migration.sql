-- audit_logs.actor_user_id is the auth subject (WorkOS sub / dev shim), not
-- necessarily a users row — so drop the FK to users (same convention as
-- Message.created_by_id / ConversationReadState.user_id, which are FK-less auth
-- subjects). The column + its index remain; only the constraint is removed.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_user_id_fkey";
