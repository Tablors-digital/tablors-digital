import "server-only";

import { getDoc, insertDocIfAbsent, listDocs, putDoc } from "@/server/modules/data/documents";

/**
 * Support tickets, stored as JSON documents in `app_documents` (collection
 * `support_tickets`, PostgreSQL). Every function takes restaurantId first and
 * filters by it. restaurantId must always come from the server session.
 *
 * Upgrade notes: `category`, `priority`, `attachments` and the "closed" status are
 * additive. Tickets saved before the upgrade are upgraded on read (normalize()),
 * so no migration is needed and no existing ticket is lost.
 */

export const TICKET_CATEGORIES = ["hardware", "software", "installation", "payment", "other"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Old ticket "type" values, kept so older records and any old reader still make sense. */
type LegacyType = "device_problem" | "replacement" | "software_issue" | "installation" | "chat";
const LEGACY_TO_CATEGORY: Record<LegacyType, TicketCategory> = {
  device_problem: "hardware",
  replacement: "hardware",
  software_issue: "software",
  installation: "installation",
  chat: "other",
};
const CATEGORY_TO_LEGACY: Record<TicketCategory, LegacyType> = {
  hardware: "device_problem",
  software: "software_issue",
  installation: "installation",
  payment: "chat",
  other: "chat",
};

export interface TicketAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** base64 file bytes. Never sent to the browser; served by /api/support-attachment. */
  data: string;
}

export interface SupportMessage {
  from: "restaurant" | "support";
  text: string;
  at: string;
}

export interface SupportTicket {
  id: string;
  restaurantId: string;
  type?: LegacyType;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  deviceId: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  attachments: TicketAttachment[];
  messages: SupportMessage[];
}

const COLLECTION = "support_tickets";

function normalize(raw: SupportTicket): SupportTicket {
  const legacy = raw.type ? LEGACY_TO_CATEGORY[raw.type] : undefined;
  return {
    ...raw,
    category: raw.category ?? legacy ?? "other",
    priority: raw.priority ?? "medium",
    deviceId: raw.deviceId ?? null,
    attachments: raw.attachments ?? [],
    messages: raw.messages ?? [],
  };
}

export async function listTickets(restaurantId: string): Promise<SupportTicket[]> {
  const docs = await listDocs<SupportTicket>(restaurantId, COLLECTION);
  return docs.map((d) => normalize(d.data)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTicket(restaurantId: string, id: string): Promise<SupportTicket | undefined> {
  const t = await getDoc<SupportTicket>(restaurantId, COLLECTION, id);
  return t ? normalize(t) : undefined;
}

export async function getTicketAttachment(
  restaurantId: string,
  ticketId: string,
  attachmentId: string,
): Promise<TicketAttachment | undefined> {
  return (await getTicket(restaurantId, ticketId))?.attachments.find((a) => a.id === attachmentId);
}

export async function createTicket(
  restaurantId: string,
  input: {
    category: TicketCategory;
    priority: TicketPriority;
    subject: string;
    description: string;
    attachments: TicketAttachment[];
  },
): Promise<SupportTicket> {
  const existing = await listDocs<SupportTicket>(restaurantId, COLLECTION);
  const highest = existing.reduce((max, d) => {
    const n = Number(d.id.replace("TKT-", ""));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 1000);
  const now = new Date().toISOString();

  // INSERT ... ON CONFLICT DO NOTHING: if two tickets race for the same number, the loser moves on to the next.
  for (let attempt = 1; attempt <= 10; attempt++) {
    const ticket: SupportTicket = {
      id: `TKT-${highest + attempt}`,
      restaurantId,
      type: CATEGORY_TO_LEGACY[input.category],
      category: input.category,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      deviceId: null,
      status: "open",
      createdAt: now,
      updatedAt: now,
      attachments: input.attachments,
      messages: [{ from: "restaurant", text: input.description, at: now }],
    };
    if (await insertDocIfAbsent(restaurantId, COLLECTION, ticket.id, ticket)) return ticket;
  }
  throw new Error("Could not allocate a unique ticket id");
}

export type ReplyResult = "ok" | "not_found" | "closed";

/** Owner reply. Replying to a resolved ticket reopens it; a closed ticket takes no replies. */
export async function addTicketMessage(restaurantId: string, id: string, text: string): Promise<ReplyResult> {
  const t = await getTicket(restaurantId, id);
  if (!t) return "not_found";
  if (t.status === "closed") return "closed";
  const now = new Date().toISOString();
  t.messages.push({ from: "restaurant", text, at: now });
  if (t.status === "resolved") t.status = "open";
  t.updatedAt = now;
  await putDoc(restaurantId, COLLECTION, id, t);
  return "ok";
}

/**
 * For the support team's side (admin tooling). Not exposed through any owner action:
 * an owner must never be able to post as "support".
 */
export async function addSupportResponse(
  restaurantId: string,
  id: string,
  text: string,
  nextStatus?: TicketStatus,
): Promise<boolean> {
  const t = await getTicket(restaurantId, id);
  if (!t) return false;
  const now = new Date().toISOString();
  t.messages.push({ from: "support", text, at: now });
  if (nextStatus) t.status = nextStatus;
  t.updatedAt = now;
  await putDoc(restaurantId, COLLECTION, id, t);
  return true;
}

export async function setTicketStatus(restaurantId: string, id: string, status: TicketStatus): Promise<boolean> {
  const t = await getTicket(restaurantId, id);
  if (!t) return false;
  t.status = status;
  t.updatedAt = new Date().toISOString();
  await putDoc(restaurantId, COLLECTION, id, t);
  return true;
}
