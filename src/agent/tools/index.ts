import type { WebClient } from "@slack/web-api";
import { searchFaqsTool } from "./search-faqs.js";
import { lookupCustomerTool } from "./lookup-customer.js";
import { platformHealthTool } from "./platform-health.js";
import { createEscalateToMondayTool } from "./escalate-to-monday.js";
import { createConsultTechAgentTool } from "./consult-tech-agent.js";
import type { TicketDraftFields } from "../../integrations/mongo/ticket-draft.js";
import type { TechAgentConfig } from "../../config/tech-agents.js";

// escalar_a_monday/consultar_agente_tecnico se arman por sesión porque necesitan el slackUserId
// de quien escribe (y, la segunda, el client de Slack para postear en el canal privado del
// cliente con su Agente Técnico) — las demás tools son sin estado. consultar_agente_tecnico solo
// se incluye si hay un TechAgentConfig resuelto para este cliente (gating, decidido en
// daniel.ts vía findTechAgentConfig) y hay un client real (no lo hay en el CLI suelto).
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
    createEscalateToMondayTool(slackUserId, effectiveDraft, channelId, onTicketCreated),
  ];
  if (techAgentConfig && client) {
    tools.push(createConsultTechAgentTool(client, slackUserId, channelId, techAgentConfig));
  }
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
