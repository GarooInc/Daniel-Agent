import type { Socket } from "socket.io-client";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getAgentConfig } from "../../integrations/postgres/agent-config.js";
import { bufferMessage } from "../../messaging/debounce-queue.js";
import { askDaniel, UnresolvedConversationError } from "../../agent/index.js";
import { escalateUnresolvedConversation } from "../../agent/auto-escalate.js";
import { sendGroupMessage } from "../../integrations/evolution-api/send-message.js";
import { insertWhatsappMessage } from "../../integrations/postgres/whatsapp-messages.js";

// Shape confirmado por Fernando 2026-09-08 (dump real de api-mainrealstate, mismo servidor
// Evolution API): `contextInfo` es hermano de `message`, no anidado dentro de
// `extendedTextMessage` como se asumía antes. En modo `lid`, el teléfono real del que escribe
// viene en `participantAlt`, no en `participant` — no lo usamos todavía pero queda documentado
// acá para el próximo campo que necesite identificar a la persona (no solo al grupo).
interface WhatsAppMessage {
  key: { remoteJid?: string; fromMe?: boolean; participant?: string; participantAlt?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
  };
  contextInfo?: { mentionedJid?: string[] };
}

// Envelope real del evento (confirmado 2026-09-08): un mensaje por evento, no un array — no
// `{ messages: [...] }` como se asumía antes de tener un ejemplo real.
interface MessagesUpsertEnvelope {
  event: string;
  instance: string;
  data: WhatsAppMessage;
}

function extractText(msg: WhatsAppMessage): string | undefined {
  return msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
}

// Punto abierto #4 del plan (sin confirmar): el JID propio de Daniel dentro de estos grupos.
// Sin WHATSAPP_BOT_JID configurado no hay forma confiable de saber si lo mencionaron — mismo
// criterio que un grupo sin mapear: mejor no responder nunca a que responda de más.
function isMentioned(msg: WhatsAppMessage): boolean {
  if (!env.whatsappBotJid) return false;
  const mentioned = msg.contextInfo?.mentionedJid ?? [];
  return mentioned.includes(env.whatsappBotJid);
}

export function registerMessageHandler(socket: Socket): void {
  // Nombre de evento y shape del payload confirmados por Fernando 2026-09-08 con un dump real
  // de api-mainrealstate (mismo servidor Evolution API, mismo cliente Socket.IO): el evento es
  // "messages.upsert" (minúsculas, punto — la convención interna de Baileys, no "MESSAGES_UPSERT"
  // como se había confirmado antes vía fetchInstances contra el namespace por instancia).
  socket.on("messages.upsert", (payload: MessagesUpsertEnvelope) => {
    const msg = payload.data;
    if (!msg || msg.key.fromMe) return;

    const groupJid = msg.key.remoteJid;
    if (!groupJid || !groupJid.endsWith("@g.us")) return; // solo grupos, no DMs 1:1

    const mencionado = isMentioned(msg);
    // A nivel info (no debug) a propósito: sin esto, si WHATSAPP_BOT_JID está mal (punto
    // abierto #4 del plan) un mensaje que sí mencionaba a Daniel se ignora en silencio y no
    // queda ningún rastro de por qué — mismo espíritu que el logging de scores de
    // search-faqs.ts. No loguea el texto del mensaje, solo metadata de mención.
    logger.info(
      { groupJid, mentionedJid: msg.contextInfo?.mentionedJid ?? [], mencionado },
      "Mensaje de grupo de WhatsApp recibido",
    );

    const texto = extractText(msg);

    // Log crudo para el "Registro de actividad" del panel (2026-09-10, ver Pendiente en
    // ESTADO-PROYECTO.md): todo mensaje de grupo, esté o no mapeado en whatsapp_groups y esté o
    // no mencionado el bot — no gatea la respuesta de Daniel, solo deja historial. No bloquea el
    // procesamiento del mensaje si falla.
    if (texto) {
      insertWhatsappMessage({
        groupJid,
        participant: msg.key.participant,
        participantAlt: msg.key.participantAlt,
        texto,
        mentioned: mencionado,
      }).catch((err) => {
        logger.error({ err, groupJid }, "No se pudo loguear un mensaje de WhatsApp en whatsapp_messages_raw");
      });
    }

    if (!mencionado) return;
    if (!texto) return;

    handleGroupMessage(groupJid, texto).catch((err) => {
      logger.error({ err, groupJid }, "Error al procesar un mensaje entrante de WhatsApp");
    });
  });
}

// Pedido de Fernando 2026-09-09: Daniel solo escucha/responde en el grupo interno "RedTec Dev"
// — en cualquier otro grupo (clientes reales) nunca contesta, ni aunque lo mencionen. Esos
// grupos solo reciben avisos salientes de cambio de estado de ticket (ver
// ticket-status-handler.ts), no son una vía de entrada. `whatsapp_groups`/`empresa` ya no gatea
// si Daniel responde acá — queda solo para el ruteo de esos avisos salientes. El JID del grupo
// interno vive en daniel_agent_config (editable desde Support-Agent-Panel, ver
// integrations/postgres/agent-config.ts), no en env.whatsappInternalGroupJid directo — por eso
// el chequeo se movió acá adentro (async) en vez de quedar sync en el callback de arriba.
async function handleGroupMessage(groupJid: string, texto: string): Promise<void> {
  const config = await getAgentConfig();
  if (groupJid !== config.whatsappInternalGroupJid) return;

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
