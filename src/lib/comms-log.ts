import type { NoteVisibility, RelatedType } from "@/lib/mock-data";

export type CommsChannel = "Email" | "Call" | "SMS" | "WhatsApp" | "Meeting" | "Note" | "Chat";
export type CommsDirection = "inbound" | "outbound";

/** Sub-tab filter groups for the Comms view. */
export type CommsFilter = "all" | "emails" | "messaging" | "calls" | "chats" | "crisp";

export interface ChatTranscriptMessage {
  from: "visitor" | "agent" | "bot";
  author: string;
  text: string;
  at: string; // ISO
}

export interface CommsLogEntry {
  id: string;
  relatedType: RelatedType;
  relatedId: string;
  channel: CommsChannel;
  direction: CommsDirection | null; // null for Note / internal
  author: string;                   // logged by (sales rep name)
  contactName?: string;            // who at the account (free text)
  subject?: string;
  body: string;
  occurred_at: string;              // ISO datetime
  follow_up_at?: string;            // optional ISO date
  /** Only meaningful when channel === "Note". Undefined for other channels. */
  visibility?: NoteVisibility;
  /** Flags this interaction as an EasyFund (financing) opportunity → notifies Fintech. */
  easyfund?: boolean;
  createdAt: string;
  /** Chat-only metadata (Crisp today, others later). */
  chat_provider?: "Crisp";
  chat_session_id?: string;
  chat_url?: string;
  chat_transcript?: ChatTranscriptMessage[];
  /** How the chat was matched to the CRM record. */
  chat_matched_by?: "contact_email" | "company_domain" | "manual";
}

/** Which sub-tab a channel belongs to. */
export function filterForChannel(channel: CommsChannel): Exclude<CommsFilter, "all"> | "notes" {
  switch (channel) {
    case "Email": return "emails";
    case "SMS":
    case "WhatsApp": return "messaging";
    case "Call":
    case "Meeting": return "calls";
    case "Chat": return "chats";
    case "Note": return "notes";
  }
}

// ---- Seed data (mock Crisp chats + a few other comms so "All" has content) ----
function iso(offsetMinutes: number): string {
  return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
}

const seed: CommsLogEntry[] = [
  {
    id: "cm_seed_chat_001",
    relatedType: "contact",
    relatedId: "cnt_001",
    channel: "Chat",
    direction: "inbound",
    author: "Crisp (auto-imported)",
    contactName: "Marco Delgado",
    subject: "Studio credits question",
    body: "Hey - quick question about how studio credits roll over into next month?",
    occurred_at: iso(60 * 3),
    createdAt: iso(60 * 3),
    chat_provider: "Crisp",
    chat_session_id: "session_9f2a1b",
    chat_url: "https://app.crisp.chat/website/xxx/inbox/session_9f2a1b/",
    chat_matched_by: "contact_email",
    chat_transcript: [
      { from: "visitor", author: "Marco Delgado", text: "Hey - quick question about how studio credits roll over into next month?", at: iso(60 * 3) },
      { from: "agent", author: "Ava (Support)", text: "Hi Marco! Unused studio credits roll over for 30 days on the Pro plan.", at: iso(60 * 3 - 2) },
      { from: "visitor", author: "Marco Delgado", text: "Perfect, thanks. Can you send that in writing to my email?", at: iso(60 * 3 - 4) },
      { from: "agent", author: "Ava (Support)", text: "On it - you'll have it in 5 min.", at: iso(60 * 3 - 5) },
    ],
  },
  {
    id: "cm_seed_chat_002",
    relatedType: "contact",
    relatedId: "cnt_002",
    channel: "Chat",
    direction: "inbound",
    author: "Crisp (auto-imported)",
    contactName: "Sophie Laurent",
    subject: "Bug: listing photos not uploading",
    body: "Photos over 8MB fail silently in the uploader.",
    occurred_at: iso(60 * 28),
    createdAt: iso(60 * 28),
    chat_provider: "Crisp",
    chat_session_id: "session_4c81de",
    chat_url: "https://app.crisp.chat/website/xxx/inbox/session_4c81de/",
    chat_matched_by: "contact_email",
    chat_transcript: [
      { from: "visitor", author: "Sophie Laurent", text: "Photos over 8MB fail silently in the uploader.", at: iso(60 * 28) },
      { from: "bot", author: "Crisp Bot", text: "Thanks - routing you to a human.", at: iso(60 * 28 - 1) },
      { from: "agent", author: "Ben (Support)", text: "Confirmed on our side. Fix rolling out this week, I'll ping you.", at: iso(60 * 28 - 6) },
    ],
  },
  {
    id: "cm_seed_email_001",
    relatedType: "contact",
    relatedId: "cnt_001",
    channel: "Email",
    direction: "outbound",
    author: "You",
    contactName: "Marco Delgado",
    subject: "Q3 renewal - DocuSign ready",
    body: "Hi Marco, sent over the renewal for signature. Let me know if anything looks off.",
    occurred_at: iso(60 * 6),
    createdAt: iso(60 * 6),
  },
  {
    id: "cm_seed_call_001",
    relatedType: "contact",
    relatedId: "cnt_001",
    channel: "Call",
    direction: "outbound",
    author: "You",
    contactName: "Marco Delgado",
    body: "Left voicemail re: renewal timing. Will follow up Thursday.",
    occurred_at: iso(60 * 20),
    createdAt: iso(60 * 20),
  },
  {
    id: "cm_seed_sms_001",
    relatedType: "contact",
    relatedId: "cnt_002",
    channel: "SMS",
    direction: "inbound",
    author: "You",
    contactName: "Sophie Laurent",
    body: "Just landed in Monaco, can we push our call to 4pm CET?",
    occurred_at: iso(60 * 10),
    createdAt: iso(60 * 10),
  },
];

const store: CommsLogEntry[] = [...seed];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeComms(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getCommsSnapshot(): CommsLogEntry[] {
  return store;
}

export function commsFor(type: RelatedType, id: string): CommsLogEntry[] {
  return store
    .filter((e) => e.relatedType === type && e.relatedId === id)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

export function logComms(entry: Omit<CommsLogEntry, "id" | "createdAt">): CommsLogEntry {
  const created: CommsLogEntry = {
    ...entry,
    id: `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  store.unshift(created);
  emit();
  return created;
}

export function updateCommsLogEntry(
  id: string,
  patch: Partial<Pick<CommsLogEntry, "body" | "visibility">>,
): CommsLogEntry | null {
  const entry = store.find((e) => e.id === id);
  if (!entry) return null;
  Object.assign(entry, patch);
  emit();
  return entry;
}
