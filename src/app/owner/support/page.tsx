import "@/components/reports/reports.css";
import "@/components/feedback/feedback.css";
import "./support.css";
import { requirePermission } from "@/server/modules/auth/session";
import { getSettings } from "@/server/modules/demo-store/settings";
import { listTickets } from "@/server/modules/demo-store/support";
import { SupportManager, type TicketRow } from "./support-manager";
import { isSupportLanguage } from "./support-i18n";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await requirePermission("support");
  const [ticketList, settings] = await Promise.all([listTickets(session.restaurantId), getSettings(session.restaurantId)]);

  // Dates go to the browser as ISO text and are formatted there, so they follow the chosen language.
  const tickets: TicketRow[] = ticketList.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    description: t.description,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    // file bytes stay on the server; the browser only gets names and a link
    attachments: t.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size })),
    messages: t.messages.map((m) => ({ from: m.from, text: m.text, at: m.at })),
  }));

  return (
    <div className="rp">
      <SupportManager
        tickets={tickets}
        initialLanguage={isSupportLanguage(settings.language) ? settings.language : "en"}
      />
    </div>
  );
}
