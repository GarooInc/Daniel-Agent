import { findTicketConversation } from "../../integrations/postgres/ticket-conversations.js";
import { notifyTicketStatusChange } from "../../integrations/slack/notify-ticket-status.js";
import { findEmpresaByMondayCliente } from "../../integrations/postgres/monday-clientes.js";
import { findGroupJidByEmpresa } from "../../integrations/postgres/whatsapp-groups.js";
import { sendGroupMessage } from "../../integrations/evolution-api/send-message.js";
import { getItemColumnValue } from "../../integrations/monday/get-item.js";
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
  if (conversation) {
    await notifyTicketStatusChange({
      channelId: conversation.channelId,
      ticketId: mondayItemId,
      title: pulseName,
      status,
    });
    return;
  }

  // Sin conversación correlacionada: es un ticket que Daniel no creó (lo creó el agente propio
  // de un cliente, directo en este mismo tablero — ver ESTADO-PROYECTO.md punto 30). Antes esto
  // se descartaba en silencio sin avisarle a nadie (bug real, encontrado 2026-09-09 con dos
  // tickets reales de RNR/Rosero Construye que nunca notificaron). Único dato de cliente
  // disponible es la columna "Cliente" del tablero, que ni el evento del webhook trae (hay que
  // pedirla aparte) ni está garantizado que venga poblada.
  const clienteColumna = await getItemColumnValue(mondayItemId, SUPPORT_BOARD_COLUMNS.cliente);
  const empresa = clienteColumna ? await findEmpresaByMondayCliente(clienteColumna) : undefined;
  const groupJid = empresa ? await findGroupJidByEmpresa(empresa) : undefined;

  if (!groupJid) {
    logger.warn({ mondayItemId, clienteColumna, empresa }, "Ticket sin conversación correlacionada ni grupo de WhatsApp resoluble — no se avisa a nadie");
    return;
  }

  const detalle = pulseName ? ` (${pulseName})` : "";
  await sendGroupMessage(groupJid, `📋 Tu ticket #${mondayItemId}${detalle} cambió de estado: ${status}`);
}
