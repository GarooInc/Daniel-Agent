import type { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { findStalePendingHandoffs, markHandoffTimeout, type TechAgentHandoffDoc } from "../integrations/postgres/tech-agent-handoff.js";
import { appendMessage } from "../integrations/postgres/conversation-memory.js";
import { addTicketUpdate } from "../integrations/monday/index.js";
import { toSlackMrkdwn } from "../channels/slack/format.js";

// A.5 (ver plans/2026-08-12-agente-tecnico-n8n-spectrum.md): si el Agente Técnico nunca
// menciona a Daniel en el hilo del handoff, éste se queda "pending" para siempre y el cliente
// no recibe respuesta — mismo gap que existía desde A.1-A.4. Chequeo periódico (no un job por
// handoff): igual que integrations/postgres/retention.ts, el proceso ya vive corriendo 24/7,
// y no hace falta precisión al minuto para avisarle al cliente que "seguimos investigando".
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function handleTimeout(client: WebClient, handoff: TechAgentHandoffDoc): Promise<void> {
  await markHandoffTimeout(handoff.threadTs);

  const mensajeCliente = "Seguimos investigando tu caso con el equipo técnico, todavía no tenemos novedades — te aviso apenas tengamos algo.";
  await client.chat.postMessage({ channel: handoff.originalChannelId, text: toSlackMrkdwn(mensajeCliente) });

  await appendMessage(handoff.originalSlackUserId, "ai", mensajeCliente).catch((err) => {
    logger.warn({ err, threadTs: handoff.threadTs }, "No se pudo guardar en el historial el aviso de timeout al cliente");
  });

  // Aviso visible en el hilo del canal compartido para que un humano lo note — el Técnico
  // puede seguir respondiendo después (el status queda en "timeout", no bloquea que
  // tech-agent-response-handler.ts procese una respuesta tardía; solo deja de avisar al
  // cliente por acá, ver findPendingHandoffByThreadTs).
  await client.chat
    .postMessage({
      channel: handoff.sharedChannelId,
      thread_ts: handoff.threadTs,
      text: `⏰ No hubo respuesta en ${Math.round((env.techAgentTimeoutMs ?? DEFAULT_TIMEOUT_MS) / 60000)} minutos — ya se le avisó al cliente que seguimos investigando.`,
    })
    .catch((err) => {
      logger.warn({ err, threadTs: handoff.threadTs }, "No se pudo postear el aviso de timeout en el canal compartido");
    });

  addTicketUpdate(handoff.mondayItemId, "El equipo técnico todavía no respondió — seguimos investigando.").catch((err) => {
    logger.warn({ err, mondayItemId: handoff.mondayItemId }, "No se pudo agregar el aviso de timeout al ticket de Monday");
  });
}

export async function checkTechAgentTimeouts(client: WebClient): Promise<void> {
  const timeoutMs = env.techAgentTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stale = await findStalePendingHandoffs(timeoutMs);

  for (const handoff of stale) {
    try {
      await handleTimeout(client, handoff);
    } catch (err) {
      logger.error({ err, threadTs: handoff.threadTs }, "Error al procesar el timeout de un handoff del Agente Técnico");
    }
  }
}

let started = false;

// Llamar una sola vez al arrancar el bot, después de app.start() (necesita app.client) — ver
// channels/slack/bot.ts. Idempotente, un segundo llamado no suma un segundo interval.
export function startTechAgentTimeoutChecker(client: WebClient): void {
  if (started) return;
  started = true;
  setInterval(() => void checkTechAgentTimeouts(client), CHECK_INTERVAL_MS).unref();
}
