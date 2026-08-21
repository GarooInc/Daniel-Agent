import { findTicketConversation } from "../../integrations/postgres/ticket-conversations.js";
import { notifyTicketStatusChange } from "../../integrations/slack/notify-ticket-status.js";
import { logger } from "../../config/logger.js";

type TicketStatusChangedPayload = {
  event: "ticket.status_changed";
  ticket_id: string | number;
  title?: string;
  status: string;
};

function isTicketStatusChangedPayload(body: unknown): body is TicketStatusChangedPayload {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return b.event === "ticket.status_changed" && (typeof b.ticket_id === "string" || typeof b.ticket_id === "number") && typeof b.status === "string";
}

// Notifica proactivamente al cliente en Slack cuando su ticket cambia de estado en Monday —
// cierra el loop que hasta el 2026-08-13 era de una sola vía (Daniel escalaba y nunca se
// enteraba de qué pasó después). Ver ESTADO-PROYECTO.md pendiente #13 para el historial
// completo. `ticket_id` es el item ID real de Monday.com (confirmado con Hugo, no una
// numeración propia del sistema interno que reenvía el evento) — coincide con la clave
// `mondayItemId` que ya se guarda en `ticket_conversations` al escalar (ver
// escalate-to-monday.ts/auto-escalate.ts).
export async function handleTicketStatusChanged(body: unknown): Promise<void> {
  if (!isTicketStatusChangedPayload(body)) return;

  const mondayItemId = String(body.ticket_id);
  const conversation = await findTicketConversation(mondayItemId);
  if (!conversation) {
    // Puede pasar con tickets creados antes de que existiera ticket_conversations, o con
    // tickets que no pasaron por Daniel — no es un error, solo no hay a quién avisarle.
    logger.warn({ mondayItemId }, "ticket.status_changed sin conversación correlacionada — no se avisa a nadie");
    return;
  }

  await notifyTicketStatusChange({
    channelId: conversation.channelId,
    ticketId: mondayItemId,
    title: body.title,
    status: body.status,
  });
}
