import type { Socket } from "socket.io-client";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { bufferMessage } from "../../messaging/debounce-queue.js";
import { findEmpresaByGroupJid } from "../../integrations/postgres/whatsapp-groups.js";
import { askDaniel, UnresolvedConversationError } from "../../agent/index.js";
import { escalateUnresolvedConversation } from "../../agent/auto-escalate.js";
import { sendGroupMessage } from "../../integrations/evolution-api/send-message.js";

// Shape de Baileys/Evolution API para el evento `messages.upsert` — solo los campos que
// usamos, el resto del payload (push name, timestamps, etc.) se ignora a propósito.
interface WhatsAppMessage {
  key: { remoteJid?: string; fromMe?: boolean };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string; contextInfo?: { mentionedJid?: string[] } };
  };
}

interface MessagesUpsertPayload {
  messages: WhatsAppMessage[];
}

function extractText(msg: WhatsAppMessage): string | undefined {
  return msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
}

// Punto abierto #4 del plan (sin confirmar): el JID propio de Daniel dentro de estos grupos.
// Sin WHATSAPP_BOT_JID configurado no hay forma confiable de saber si lo mencionaron — mismo
// criterio que un grupo sin mapear: mejor no responder nunca a que responda de más.
function isMentioned(msg: WhatsAppMessage): boolean {
  if (!env.whatsappBotJid) return false;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  return mentioned.includes(env.whatsappBotJid);
}

export function registerMessageHandler(socket: Socket): void {
  socket.on("messages.upsert", (payload: MessagesUpsertPayload) => {
    for (const msg of payload.messages ?? []) {
      if (msg.key.fromMe) continue;

      const groupJid = msg.key.remoteJid;
      if (!groupJid || !groupJid.endsWith("@g.us")) continue; // solo grupos, no DMs 1:1

      const mencionado = isMentioned(msg);
      // A nivel info (no debug) a propósito: sin esto, si WHATSAPP_BOT_JID está mal (punto
      // abierto #4 del plan) un mensaje que sí mencionaba a Daniel se ignora en silencio y no
      // queda ningún rastro de por qué — mismo espíritu que el logging de scores de
      // search-faqs.ts. No loguea el texto del mensaje, solo metadata de mención.
      logger.info(
        { groupJid, mentionedJid: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [], mencionado },
        "Mensaje de grupo de WhatsApp recibido",
      );

      if (!mencionado) continue;

      const texto = extractText(msg);
      if (!texto) continue;

      handleGroupMessage(groupJid, texto).catch((err) => {
        logger.error({ err, groupJid }, "Error al procesar un mensaje entrante de WhatsApp");
      });
    }
  });
}

async function handleGroupMessage(groupJid: string, texto: string): Promise<void> {
  const empresa = await findEmpresaByGroupJid(groupJid);
  if (!empresa) {
    // Mismo espíritu que "nunca prometerle al cliente algo que no se hizo": mejor silencio
    // que contestarle a un grupo interno de RedTec o a un cliente sin clasificar todavía.
    logger.warn({ groupJid }, "Grupo de WhatsApp sin mapear a ningún cliente en whatsapp_groups, se ignora");
    return;
  }

  await bufferMessage("whatsapp", groupJid, groupJid, texto);
}

// Flush del debounce para WhatsApp — mismo rol que handleResolvedMessage en
// channels/slack/message-handler.ts, adaptado a que acá no hay un usuario 1:1 (el grupo entero
// es la unidad de conversación, ver plan) ni una forma de resolver un nombre de cliente vía
// API (no hay equivalente a client.users.info de Slack).
export async function handleResolvedWhatsappMessage(groupJid: string, texto: string): Promise<void> {
  try {
    const respuesta = await askDaniel(texto, groupJid, groupJid);
    await sendGroupMessage(groupJid, respuesta);
  } catch (error) {
    logger.error({ err: error, groupJid }, "Error al consultar a Daniel (WhatsApp)");

    const motivo =
      error instanceof UnresolvedConversationError
        ? "agotó los pasos permitidos sin llegar a una respuesta final"
        : "error interno inesperado";

    const ticketId = await escalateUnresolvedConversation({
      slackUserId: groupJid,
      channelId: groupJid,
      nombreClienteFallback: `Grupo de WhatsApp ${groupJid}`,
      textoOriginal: texto,
      motivo,
    });

    const respuestaFallback = ticketId
      ? `Tuve un problema técnico para responder tu consulta. Ya escalé tu mensaje a soporte (ticket #${ticketId}) y en breve alguien del equipo te contacta.`
      : "Tuve un problema para responder tu consulta y tampoco pude escalarla automáticamente. Por favor escribile directamente a soporte.";

    await sendGroupMessage(groupJid, respuestaFallback).catch((sendError) => {
      logger.error({ err: sendError, groupJid }, "No se pudo enviar el mensaje de fallback a WhatsApp");
    });
  }
}
