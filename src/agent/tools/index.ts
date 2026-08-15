import type { WebClient } from "@slack/web-api";
import { searchFaqsTool } from "./search-faqs.js";
import { lookupCustomerTool } from "./lookup-customer.js";
import { platformHealthTool } from "./platform-health.js";
import { createEscalateToMondayTool } from "./escalate-to-monday.js";
import type { TicketDraftFields } from "../../integrations/mongo/ticket-draft.js";
import type { TechAgentConfig } from "../../config/tech-agents.js";

// escalar_a_monday se arma por sesión porque necesita el slackUserId de quien escribe — las
// demás tools son sin estado. client/techAgentConfig se le pasan a escalar_a_monday para que,
// determinísticamente (no por elección del modelo, ver plans/2026-08-12-agente-tecnico-n8n-spectrum.md,
// sección E), avise al Agente Técnico apenas se crea un ticket real de un cliente que lo tenga
// configurado — ya no existe una tool aparte `consultar_agente_tecnico` que el modelo elija
// llamar.
export function buildToolsByName(
  slackUserId: string,
  effectiveDraft: TicketDraftFields,
  channelId: string,
  client: WebClient | undefined,
  techAgentConfig: TechAgentConfig | undefined,
  onTicketCreated?: () => void,
): Record<string, any> {
  const tools: any[] = [
    searchFaqsTool,
    lookupCustomerTool,
    platformHealthTool,
    createEscalateToMondayTool(slackUserId, effectiveDraft, channelId, client, techAgentConfig, onTicketCreated),
  ];
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
