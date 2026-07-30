import { searchFaqsTool } from "./search-faqs.js";
import { lookupCustomerTool } from "./lookup-customer.js";
import { createEscalateToMondayTool } from "./escalate-to-monday.js";

// escalar_a_monday se arma por sesión porque necesita el slackUserId de quien escribe
// (para guardar su perfil una vez que da nombre/email) — las demás tools son sin estado.
export function buildToolsByName(slackUserId: string): Record<string, any> {
  const tools = [searchFaqsTool, lookupCustomerTool, createEscalateToMondayTool(slackUserId)];
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

// Solo para bindTools() en model.ts: el modelo necesita nombre/descripción/schema de cada
// tool para el function-calling, no la implementación — el slackUserId acá es irrelevante.
export const tools = [searchFaqsTool, lookupCustomerTool, createEscalateToMondayTool("__schema_binding__")];
