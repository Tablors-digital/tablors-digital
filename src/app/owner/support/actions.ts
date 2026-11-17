"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession } from "@/server/modules/auth/session";
import { getSettings, saveSettings } from "@/server/modules/demo-store/settings";
import {
  addTicketMessage,
  createTicket,
  getTicket,
  setTicketStatus,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketAttachment,
} from "@/server/modules/demo-store/support";
import { isSupportLanguage, type SupportErrorCode } from "./support-i18n";

/**
 * Every action re-checks the session and the "support" permission on the server and
 * scopes all data to session.restaurantId. Errors are returned as codes (not English
 * text) so the page can show them in the owner's language.
 */
export type SupportActionResult =
  | { ok: true; ticketId?: string }
  | { ok: false; code: SupportErrorCode; detail?: string };

const fail = (code: SupportErrorCode, detail?: string): SupportActionResult => ({ ok: false, code, detail });

async function authorize() {
  const session = await getDemoSession();
  if (!session || !hasPermission(session.role, "support")) return null;
  return session;
}

// Server actions accept a 1 MB request body by default, so 3 x 300 KB stays inside it.
const MAX_FILES = 3;
const MAX_FILE_BYTES = 300 * 1024;

/** Reads the real file signature; the browser-reported type is never trusted. */
function sniff(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  return null;
}

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const createSchema = z.object({
  subject: z.string().trim().min(3, "subject_short").max(120, "subject_long"),
  category: z.enum(TICKET_CATEGORIES, { message: "category" }),
  priority: z.enum(TICKET_PRIORITIES, { message: "priority" }),
  description: z.string().trim().min(10, "description_short").max(2000, "description_long"),
});

export async function createTicketAction(formData: FormData): Promise<SupportActionResult> {
  const session = await authorize();
  if (!session) return fail("unauthorized");

  const parsed = createSchema.safeParse({
    subject: text(formData, "subject"),
    category: text(formData, "category"),
    priority: text(formData, "priority"),
    description: text(formData, "description"),
  });
  if (!parsed.success) return fail((parsed.error.issues[0]?.message ?? "generic") as SupportErrorCode);

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return fail("file_count");

  const attachments: TicketAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return fail("file_size", file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniff(bytes);
    if (!mime) return fail("file_type", file.name);
    attachments.push({
      id: `att_${randomUUID()}`,
      name: file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 120) || "attachment",
      mime,
      size: bytes.byteLength,
      data: Buffer.from(bytes).toString("base64"),
    });
  }

  try {
    const ticket = await createTicket(session.restaurantId, { ...parsed.data, attachments });
    revalidatePath("/owner/support");
    return { ok: true, ticketId: ticket.id };
  } catch {
    return fail("generic");
  }
}

export async function replyTicketAction(id: unknown, message: unknown): Promise<SupportActionResult> {
  const session = await authorize();
  if (!session) return fail("unauthorized");
  const p = z
    .object({ id: z.string().min(1).max(50), text: z.string().trim().min(1).max(2000) })
    .safeParse({ id, text: message });
  if (!p.success) return fail("reply_empty");
  const result = await addTicketMessage(session.restaurantId, p.data.id, p.data.text);
  if (result === "not_found") return fail("not_found");
  if (result === "closed") return fail("closed");
  revalidatePath("/owner/support");
  return { ok: true };
}

/**
 * What an owner may do to a ticket's status:
 *   resolve: open / in progress -> resolved      reopen: resolved -> open
 *   close:   open / in progress / resolved -> closed (final)
 * "In progress" is set by the support team, never from this page.
 */
export async function changeTicketStatusAction(id: unknown, action: unknown): Promise<SupportActionResult> {
  const session = await authorize();
  if (!session) return fail("unauthorized");
  const p = z.object({ id: z.string().min(1).max(50), action: z.enum(["resolve", "reopen", "close"]) }).safeParse({ id, action });
  if (!p.success) return fail("transition");

  const ticket = await getTicket(session.restaurantId, p.data.id);
  if (!ticket) return fail("not_found");

  let next: "open" | "resolved" | "closed";
  if (p.data.action === "resolve" && (ticket.status === "open" || ticket.status === "in_progress")) next = "resolved";
  else if (p.data.action === "reopen" && ticket.status === "resolved") next = "open";
  else if (p.data.action === "close" && ticket.status !== "closed") next = "closed";
  else return fail("transition");

  await setTicketStatus(session.restaurantId, ticket.id, next);
  revalidatePath("/owner/support");
  return { ok: true };
}

/**
 * Remembers the language chosen on the Support page by saving it to the existing
 * Settings -> Language value. Only roles allowed to edit Settings can save it; for the
 * others the page still switches instantly, it just is not remembered.
 */
export async function setSupportLanguageAction(language: unknown): Promise<{ saved: boolean }> {
  const session = await authorize();
  if (!session || !isSupportLanguage(language) || !hasPermission(session.role, "settings")) return { saved: false };
  const settings = await getSettings(session.restaurantId);
  if (settings.language !== language) {
    await saveSettings(session.restaurantId, { ...settings, language });
    revalidatePath("/owner/settings");
  }
  return { saved: true };
}
