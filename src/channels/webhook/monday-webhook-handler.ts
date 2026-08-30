import { findTicketConversation } from "../../integrations/postgres/ticket-conversations.js";
import { notifyTicketStatusChange } from "../../integrations/slack/notify-ticket-status.js";
import { SUPPORT_BOARD_COLUMNS, SUPPORT_BOARD_ID } from "../../integrations/monday/board.js";
import { logger } from "../../config/logger.js";

type MondayChallenge = { challenge: string };

type MondayStatusChangeEvent = {
  event: {
    boardId: number;
    pulseId: number;
    pulseName?: string;
    columnId: string;
    value?: { label?: { text?: string } };
  };
};

// El webhook nativo de Monday manda un POST con {"challenge": "..."} una sola vez, al conectar
// la automatización — hay que responder exactamente el mismo valor para que la conexión quede
// activa. Ver server.ts, esto se chequea antes de procesar cualquier otra cosa.
export function isMondayChallenge(body: unknown): body is MondayChallenge {
  return typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).challenge === "string";
}

function isMondayStatusChangeEvent(body: unknown): body is MondayStatusChangeEvent {
  if (typeof body !== "object" || body === null) return false;
  const event = (body as Record<string, unknown>).event;
  if (typeof event !== "object" || event === null) return false;
  const e = event as Record<string, unknown>;
  return typeof e.boardId === "number" && typeof e.pulseId === "number" && typeof e.columnId === "string";
}

// Procesa el shape nativo de la automatización de Monday.com (evento update_column_value),
// distinto del shape custom que sigue usando ticket-status-handler.ts vía /webhook/internal.
// Monday no manda X-Webhook-Secret en un webhook nativo estándar, así que la ruta que llama a
// esto (ver server.ts) no valida secreto — la única validación posible acá es por contenido:
// boardId y columnId conocidos (board de producción, columna de estado).
export async function handleMondayNativeEvent(body: unknown): Promise<void> {
  if (!isMondayStatusChangeEvent(body)) return;

  const { boardId, pulseId, columnId, pulseName } = body.event;
  if (boardId !== SUPPORT_BOARD_ID || columnId !== SUPPORT_BOARD_COLUMNS.estado) return;

  const status = body.event.value?.label?.text;
  if (!status) return;

  const mondayItemId = String(pulseId);
  const conversation = await findTicketConversation(mondayItemId);
  if (!conversation) {
    logger.warn({ mondayItemId }, "Evento nativo de Monday sin conversación correlacionada — no se avisa a nadie");
    return;
  }

  await notifyTicketStatusChange({
    channelId: conversation.channelId,
    ticketId: mondayItemId,
    title: pulseName,
    status,
  });
}
