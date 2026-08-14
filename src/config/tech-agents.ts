export type TechAgentConfig = {
  empresa: string;
  slackChannel: string;
  slackBotUserId: string;
};

// Ruteo cliente -> canal privado + bot del Agente Técnico (Hermes Agent) de ese cliente. Ver
// plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección E.3 — reemplaza los env vars únicos
// SLACK_AGENTS_CHANNEL/SLACK_TECH_AGENT_USER_ID/TECH_AGENT_CLIENTE_SOPORTADO (pensados para un
// solo cliente). Vive en código por ahora, mismo criterio que customers.json antes de migrar a
// Mongo (E.4, sin decidir todavía si esto termina en la colección `customers`) — sumar un
// cliente nuevo es agregar una fila acá.
export const TECH_AGENTS: TechAgentConfig[] = [
  {
    empresa: "Spectrum",
    slackChannel: process.env.TECH_AGENT_SPECTRUM_CHANNEL || "tecnico-spectrum",
    slackBotUserId: process.env.TECH_AGENT_SPECTRUM_BOT_USER_ID || "",
  },
];

export function findTechAgentConfig(empresa: string | undefined): TechAgentConfig | undefined {
  if (!empresa) return undefined;
  return TECH_AGENTS.find((c) => c.empresa.toLowerCase() === empresa.toLowerCase());
}
