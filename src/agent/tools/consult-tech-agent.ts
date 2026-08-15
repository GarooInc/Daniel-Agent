import { tool } from "@langchain/core/tools";
import type { WebClient } from "@slack/web-api";
import { z } from "zod";
import type { TechAgentConfig } from "../../config/tech-agents.js";
import { resolveChannelId } from "../../integrations/slack/resolve-channel.js";
import { createHandoff } from "../../integrations/mongo/tech-agent-handoff.js";
import { logger } from "../../config/logger.js";

// Factory (mismo patrón que escalar_a_monday): necesita el client de Slack para postear en el
// canal privado del cliente con su Agente Técnico, y slackUserId/originalChannelId para poder
// correlacionar la respuesta diferida de vuelta a esta conversación (ver
// plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección E). El TechAgentConfig (canal + bot
// del Técnico de este cliente puntual) se resuelve en daniel.ts vía findTechAgentConfig() antes
// de bindear esta tool — mismo lugar donde se resuelve el gating por cliente (decisión #3).
export function createConsultTechAgentTool(
  client: WebClient,
  slackUserId: string,
  originalChannelId: string,
  config: TechAgentConfig,
) {
  return tool(
    async ({ resumenProblema }) => {
      const channelId = await resolveChannelId(client, config.slackChannel);
      if (!channelId || !config.slackBotUserId) {
        logger.warn({ channel: config.slackChannel }, "No se encontró el canal privado con el Agente Técnico o falta su bot user ID");
        return "No tengo forma de contactar al equipo técnico en este momento.";
      }

      const posted = await client.chat.postMessage({
        channel: channelId,
        text:
          `<@${config.slackBotUserId}> necesito tu ayuda con un cliente.\n\n` +
          `*Problema reportado:*\n${resumenProblema}\n\nRespondé en este hilo cuando tengas un diagnóstico.`,
      });

      const threadTs = posted.ts as string;
      await createHandoff({
        threadTs,
        sharedChannelId: channelId,
        originalSlackUserId: slackUserId,
        originalChannelId,
        resumenProblema,
      });

      return "Ya le pasé el caso al equipo técnico. Avisale al cliente que estás investigando — la respuesta te va a llegar después, no en este turno.";
    },
    {
      name: "consultar_agente_tecnico",
      description:
        "Consulta al equipo técnico interno cuando el cliente reporta un problema concreto en una " +
        "automatización/integración propia (no en los productos estándar), y no hay FAQ que lo resuelva. " +
        "La respuesta NO llega en este turno.",
      schema: z.object({
        resumenProblema: z.string().describe(
          "Resumen completo: qué hace la automatización, qué error/comportamiento ve el cliente, desde cuándo.",
        ),
      }),
    },
  );
}
