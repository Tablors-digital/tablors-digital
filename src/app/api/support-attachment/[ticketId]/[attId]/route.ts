import { hasPermission } from "@/server/modules/auth/permissions";
import { getDemoSession } from "@/server/modules/auth/session";
import { getTicketAttachment } from "@/server/modules/demo-store/support";

export const dynamic = "force-dynamic";

/**
 * Serves a support-ticket attachment. Unlike menu photos this is NOT public: it needs a
 * signed-in user with the support permission, and only reads from that session's own
 * restaurant, so another restaurant's ticket id simply returns 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string; attId: string }> },
) {
  const session = await getDemoSession();
  if (!session || !hasPermission(session.role, "support")) return new Response("Not found", { status: 404 });

  const { ticketId, attId } = await params;
  const att = await getTicketAttachment(session.restaurantId, ticketId, attId);
  if (!att) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(att.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": att.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
