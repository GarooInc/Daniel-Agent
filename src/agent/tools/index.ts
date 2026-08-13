import type { WebClient } from "@slack/web-api";
import { searchFaqsTool } from "./search-faqs.js";
import { lookupCustomerTool } from "./lookup-customer.js";
import { platformHealthTool } from "./platform-health.js";
import { createEscalateToMondayTool } from "./escalate-to-monday.js";
import { createConsultTechAgentTool } from "./consult-tech-agent.js";
import type { TicketDraftFields } from "../../integrations/mongo/ticket-draft.js";

// escalar_a_monday/consultar_agente_tecnico se arman por sesión porque necesitan el slackUserId
// de quien escribe (y, la segunda, el client de Slack para postear en el canal compartido) —
// las demás tools son sin estado. consultar_agente_tecnico solo se incluye si techAgentEnabled
// (gating por cliente, decidido en daniel.ts) y hay un client real (no lo hay en el CLI suelto).
export function buildToolsByName(
  slackUserId: string,
  effectiveDraft: TicketDraftFields,
  channelId: string,
  client: WebClient | undefined,
  techAgentEnabled: boolean,
  onTicketCreated?: () => void,
): Record<string, any> {
  const tools: any[] = [
    searchFaqsTool,
    lookupCustomerTool,
    platformHealthTool,
    createEscalateToMondayTool(slackUserId, effectiveDraft, channelId, onTicketCreated),
  ];
  if (techAgentEnabled && client) {
    tools.push(createConsultTechAgentTool(client, slackUserId, channelId));
  }
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
