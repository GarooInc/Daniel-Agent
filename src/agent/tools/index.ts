import { searchFaqsTool } from "./search-faqs.js";
import { lookupCustomerTool } from "./lookup-customer.js";
import { createEscalateToMondayTool } from "./escalate-to-monday.js";
import type { TicketDraftFields } from "../../integrations/mongo/ticket-draft.js";

// escalar_a_monday se arma por sesión porque necesita el slackUserId de quien escribe y el
// borrador ya calculado por daniel.ts para esta conversación — las demás tools son sin estado.
export function buildToolsByName(slackUserId: string, effectiveDraft: TicketDraftFields): Record<string, any> {
  const tools = [searchFaqsTool, lookupCustomerTool, createEscalateToMondayTool(slackUserId, effectiveDraft)];
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

// Solo para bindTools() en model.ts: el modelo necesita nombre/descripción/schema de cada
// tool para el function-calling, no la implementación — slackUserId/draft acá son irrelevantes.
export const tools = [searchFaqsTool, lookupCustomerTool, createEscalateToMondayTool("__schema_binding__", {})];
