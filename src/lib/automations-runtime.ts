import { getCompany } from "@/lib/mock-data";
import { readAdminConfig } from "@/lib/admin-config";
import { pushNotification } from "@/lib/notifications";

/**
 * Runtime automations that fire on record changes (mock).
 *
 * These mirror flows an admin would configure in Admin → Automations; the
 * behaviour is implemented here so the effects are real in the demo. Server
 * automations replace this at the API layer later.
 */

type ContactLike = Record<string, unknown> & {
  id: string;
  firstName?: string;
  lastName?: string;
  companyId?: string | null;
};

/** Resolve the account owner (name) for a contact via its company. */
function accountOwnerName(contact: ContactLike): string | undefined {
  const companyId = contact.companyId ?? undefined;
  const company = companyId ? getCompany(companyId) : undefined;
  const ownerId = company?.ownerUserId ?? undefined;
  if (!ownerId) return undefined;
  return readAdminConfig().users.find((u) => u.id === ownerId)?.name;
}

/**
 * Contact automations. Call with the record before and after a save.
 *
 * - paid_seat_on_platform unchecked → checked: email the account owner and
 *   raise a banner on their home dashboard.
 */
export function runContactSaveAutomations(prev: ContactLike, next: ContactLike) {
  const before = Boolean(prev.paidSeatOnPlatform);
  const after = Boolean(next.paidSeatOnPlatform);

  if (!before && after) {
    const owner = accountOwnerName(next);
    const name = [next.firstName, next.lastName].filter(Boolean).join(" ") || "A contact";
    if (owner) {
      pushNotification({
        title: "Paid seat activated",
        message: `${name} now has a paid seat on the platform. As the account owner, you've been emailed.`,
        audienceUserName: owner,
        banner: true,
        link: { to: "/contacts/$id", params: { id: next.id }, label: "Open contact" },
      });
    }
  }
}
