export const REQUIRED_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "SLACK_APP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "MONDAY_API_TOKEN",
  "POSTGRES_URL",
  "REDIS_URL",
] as const;

export function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

export const env = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  slackAppToken: process.env.SLACK_APP_TOKEN,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
  slackEscalationChannel: process.env.SLACK_ESCALATION_CHANNEL || "escalacion",
  mondayApiToken: process.env.MONDAY_API_TOKEN,
  redisUrl: process.env.REDIS_URL,
  webhookPort: Number.parseInt(process.env.WEBHOOK_PORT || "3300", 10),
  // Si no está seteado, el webhook queda abierto (sin validar remitente) — pensado para el
  // arranque exploratorio mientras se descubre la estructura de los payloads que van a llegar.
  webhookSecret: process.env.WEBHOOK_SECRET,
  // Opcionales a propósito (no van en REQUIRED_ENV_VARS): el bot tiene que arrancar igual sin
  // esto. RedTec todavía no confirmó la URL real de su plataforma — eso sigue bloqueando el
  // primer deploy real. La ambigüedad del NOMBRE del secreto (la guía dice
  // SUPPORT_AGENT_WEBHOOK_SECRET en el texto pero REDTEC_PLATFORM_WS_SECRET en el código de
  // ejemplo) ya no bloquea nada: se acepta cualquiera de los dos nombres, así que cuando
  // Coolify tenga cargada la variable que RedTec efectivamente use, esto conecta sin necesitar
  // otro cambio de código/redeploy. Ver integrations/redtec-realtime/client.ts.
  redtecRealtimeUrl: process.env.REDTEC_PLATFORM_WS_URL,
  redtecRealtimeSecret: process.env.REDTEC_PLATFORM_WS_SECRET || process.env.SUPPORT_AGENT_WEBHOOK_SECRET,
  // Persistencia real desde la migración MongoDB -> PostgreSQL+pgvector (2026-08-18/21, ver
  // plans/2026-08-18-migracion-postgresql-pgvector.md) — requerida, ya no convive con Mongo.
  postgresUrl: process.env.POSTGRES_URL,
  // Agente Técnico: ruteo cliente -> canal/bot en la tabla `tech_agents` de Postgres
  // (integrations/postgres/tech-agents.ts), no en env vars — ver
  // plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección E.3.
  // A.5 — timeout si el Agente Técnico no responde. Opcional a propósito (no en
  // REQUIRED_ENV_VARS): sin esto, agent/tech-agent-timeout.ts usa el default de 15 minutos.
  techAgentTimeoutMs: process.env.TECH_AGENT_TIMEOUT_MS ? Number(process.env.TECH_AGENT_TIMEOUT_MS) : undefined,
  // Canal de WhatsApp (Evolution API self-hosted sobre Baileys, instancia compartida `RedtecBot`
  // de RedTec) — ver plans/2026-09-06-canal-whatsapp-evolution-api.md. Opcionales a propósito
  // (no en REQUIRED_ENV_VARS): sin esto, integrations/evolution-api/client.ts no intenta
  // conectar y el resto del bot sigue igual.
  whatsappEvolutionUrl: process.env.WHATSAPP_EVOLUTION_URL,
  whatsappEvolutionApiKey: process.env.WHATSAPP_EVOLUTION_API_KEY,
  whatsappEvolutionInstance: process.env.WHATSAPP_EVOLUTION_INSTANCE || "RedtecBot",
  // JID propio del bot dentro de los grupos (equivalente al BOT_USER_ID de Slack). Candidato
  // confirmado por GET /instance/fetchInstances (2026-09-06, real, contra la instancia
  // RedtecBot): "13322311881@s.whatsapp.net" (su ownerJid) — falta confirmar que ese mismo
  // valor es el que trae `contextInfo.mentionedJid` en un mensaje real que mencione al bot
  // (solo se ve con tráfico real, no con un GET). Sin esto seteado, el canal escucha pero
  // nunca responde (ver channels/whatsapp/message-handler.ts): mejor silencio que contestar de
  // más sin poder confirmar una mención real.
  whatsappBotJid: process.env.WHATSAPP_BOT_JID,
};
