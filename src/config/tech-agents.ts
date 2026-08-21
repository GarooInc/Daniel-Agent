export type TechAgentConfig = {
  empresa: string;
  slackChannel: string;
  slackBotUserId: string;
};

// El ruteo cliente -> canal/bot del Agente Técnico (Hermes Agent) vivía acá hardcodeado
// (TECH_AGENTS) hasta el 2026-08-21 — ver plans/2026-08-12-agente-tecnico-n8n-spectrum.md,
// sección E.3, y ESTADO-PROYECTO.md pendiente #3. Ahora vive en la tabla `tech_agents` de
// Postgres (integrations/postgres/tech-agents.ts, findTechAgentConfig/listTechAgents) para que
// sumar un cliente nuevo sea un INSERT y no un deploy de código. Este archivo solo mantiene el
// tipo compartido entre esa capa y las tools que reciben un TechAgentConfig ya resuelto
// (consult-tech-agent.ts, escalate-to-monday.ts).
