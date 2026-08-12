export const REQUIRED_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "SLACK_APP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "MONDAY_API_TOKEN",
  "MONGODB_URI",
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
  mongodbUri: process.env.MONGODB_URI,
  mongodbDbName: process.env.MONGODB_DB_NAME || "daniel",
  redisUrl: process.env.REDIS_URL,
  webhookPort: Number.parseInt(process.env.WEBHOOK_PORT || "3300", 10),
  // Si no está seteado, el webhook queda abierto (sin validar remitente) — pensado para el
  // arranque exploratorio mientras se descubre la estructura de los payloads que van a llegar.
  webhookSecret: process.env.WEBHOOK_SECRET,
  // Opcionales a propósito (no van en REQUIRED_ENV_VARS): el bot tiene que arrancar igual sin
  // esto. RedTec todavía no confirmó la URL real de su plataforma, y su guía es inconsistente
  // sobre el nombre del secreto (dice SUPPORT_AGENT_WEBHOOK_SECRET en el texto pero
  // REDTEC_PLATFORM_WS_SECRET en el código de ejemplo) — confirmar antes de cargar un valor
  // real. Ver integrations/redtec-realtime/client.ts.
  redtecRealtimeUrl: process.env.REDTEC_PLATFORM_WS_URL,
  redtecRealtimeSecret: process.env.REDTEC_PLATFORM_WS_SECRET,
};
