import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { askDaniel, UnresolvedConversationError } from "../../agent/index.js";
import { escalateUnresolvedConversation } from "../../agent/auto-escalate.js";
import { bufferMessage } from "../../messaging/debounce-queue.js";
import { logger } from "../../config/logger.js";

const PROCESSED_EVENT_TTL_MS = 60_000;
const processedEvents = new Map<string, number>();

function alreadyProcessed(eventId: string): boolean {
  const now = Date.now();
  for (const [id, seenAt] of processedEvents) {
    if (now - seenAt > PROCESSED_EVENT_TTL_MS) processedEvents.delete(id);
  }

  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}

// Consulta a Daniel (o escala automáticamente si falla) y responde con `respond`, sin asumir
// de dónde viene el mensaje ni cómo se contesta — la usa tanto el handler de mensaje entrante
// (vía say()) como el flush del debounce (vía chat.postMessage, fuera del evento original).
export async function handleResolvedMessage(
  client: WebClient,
  slackUserId: string,
  texto: string,
  respond: (text: string) => Promise<unknown>,
): Promise<void> {
  try {
    const respuesta = await askDaniel(texto, slackUserId);
    await respond(respuesta);
  } catch (error) {
    logger.error({ err: error, slackUserId }, "Error al consultar a Daniel");

    let nombreCliente = `Usuario de Slack ${slackUserId}`;
    try {
      const info = await client.users.info({ user: slackUserId });
      nombreCliente = info.user?.real_name || info.user?.name || nombreCliente;
    } catch (lookupError) {
      logger.warn({ err: lookupError, slackUserId }, "No se pudo obtener el nombre del usuario de Slack");
    }

    const motivo =
      error instanceof UnresolvedConversationError
        ? "agotó los pasos permitidos sin llegar a una respuesta final"
        : "error interno inesperado";

    const ticketId = await escalateUnresolvedConversation({
      slackUserId,
      nombreClienteFallback: nombreCliente,
      textoOriginal: texto,
      motivo,
    });

    if (ticketId) {
      await respond(
        `Tuve un problema técnico para responder tu consulta. Ya escalé tu mensaje a soporte (ticket #${ticketId}) y en breve alguien del equipo te contacta.`,
      );
    } else {
      await respond(
        "Tuve un problema para responder tu consulta y tampoco pude escalarla automáticamente. Por favor escribile directamente a soporte.",
      );
    }
  }
}

export function registerMessageHandler(app: App, botUserId: string): void {
  const mentionTag = `<@${botUserId}>`;

  app.message(async ({ message }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;
    if (!("user" in message) || !message.user) return;
    if (!("channel" in message) || !message.channel) return;

    // En un DM no tiene sentido pedirle al cliente que mencione al bot; en canales
    // (donde Daniel convive con otra gente) sí seguimos exigiendo la mención.
    const isDirectMessage = "channel_type" in message && message.channel_type === "im";
    if (!isDirectMessage && !message.text.includes(mentionTag)) return;

    const slackUserId = message.user;
    const channelId = message.channel;

    // Slack Events API puede reenviar el mismo mensaje si no se acusa recibo a tiempo
    // (askDaniel + la tool de Monday pueden tardar más de los ~3s que Slack espera).
    const eventId = "client_msg_id" in message ? message.client_msg_id : undefined;
    if (eventId && alreadyProcessed(eventId)) {
      logger.warn({ eventId }, "Mensaje duplicado de Slack ignorado");
      return;
    }

    const texto = message.text.replaceAll(mentionTag, "").trim();

    try {
      await bufferMessage("slack", slackUserId, channelId, texto);
    } catch (error) {
      logger.error({ err: error, slackUserId }, "No se pudo bufferizar el mensaje para el debounce");
    }
  });
}
