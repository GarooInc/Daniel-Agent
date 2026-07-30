import type { App } from "@slack/bolt";
import { askDaniel, UnresolvedConversationError } from "../../agent/index.js";
import { escalateUnresolvedConversation } from "../../agent/auto-escalate.js";
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

export function registerMessageHandler(app: App, botUserId: string): void {
  const mentionTag = `<@${botUserId}>`;

  app.message(async ({ message, say, client }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;
    if (!message.text.includes(mentionTag)) return;
    if (!("user" in message) || !message.user) return;

    const slackUserId = message.user;

    // Slack Events API puede reenviar el mismo mensaje si no se acusa recibo a tiempo
    // (askDaniel + la tool de Monday pueden tardar más de los ~3s que Slack espera).
    const eventId = "client_msg_id" in message ? message.client_msg_id : undefined;
    if (eventId && alreadyProcessed(eventId)) {
      logger.warn({ eventId }, "Mensaje duplicado de Slack ignorado");
      return;
    }

    const texto = message.text.replaceAll(mentionTag, "").trim();

    try {
      const respuesta = await askDaniel(texto, slackUserId);
      await say(respuesta);
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
        await say(
          `Tuve un problema técnico para responder tu consulta. Ya escalé tu mensaje a soporte (ticket #${ticketId}) y en breve alguien del equipo te contacta.`,
        );
      } else {
        await say(
          "Tuve un problema para responder tu consulta y tampoco pude escalarla automáticamente. Por favor escribile directamente a soporte.",
        );
      }
    }
  });
}
