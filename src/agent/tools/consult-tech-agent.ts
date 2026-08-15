import type { WebClient } from "@slack/web-api";
import type { TechAgentConfig } from "../../config/tech-agents.js";
import { resolveChannelId } from "../../integrations/slack/resolve-channel.js";
import { createHandoff } from "../../integrations/mongo/tech-agent-handoff.js";
import { logger } from "../../config/logger.js";

// Función plana, no una tool de LangChain: la decisión de consultar al Agente Técnico dejó de
// ser algo que el modelo elige (ver plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección E,
// y el hallazgo en vivo del 2026-08-14/15 donde el modelo escaló un problema técnico a un
// ticket humano sin nunca consultar al Técnico) — ahora es un efecto secundario determinístico
// de escalar_a_monday (ver escalate-to-monday.ts), disparado en código para cualquier ticket de
// un cliente con Agente Técnico configurado.
export async function notifyTechAgent(
  client: WebClient,
  slackUserId: string,
  originalChannelId: string,
  config: TechAgentConfig,
  resumenProblema: string,
  mondayItemId: string,
): Promise<void> {
  const channelId = await resolveChannelId(client, config.slackChannel);
  if (!channelId || !config.slackBotUserId) {
    logger.warn({ channel: config.slackChannel }, "No se encontró el canal privado con el Agente Técnico o falta su bot user ID");
    return;
  }

  const posted = await client.chat.postMessage({
    channel: channelId,
    text:
      `<@${config.slackBotUserId}> necesito tu ayuda con un cliente (ticket #${mondayItemId}).\n\n` +
      `*Problema reportado:*\n${resumenProblema}\n\nRespondé en este hilo cuando tengas un diagnóstico.`,
  });

  await createHandoff({
    threadTs: posted.ts as string,
    sharedChannelId: channelId,
    originalSlackUserId: slackUserId,
    originalChannelId,
    resumenProblema,
    mondayItemId,
  });
}
