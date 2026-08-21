// Script de un solo uso: siembra la tabla `tech_agents` de Postgres con el cliente que hoy vive
// hardcodeado (Spectrum, ver git history de config/tech-agents.ts antes de 2026-08-21). Idempotente
// (upsertTechAgent hace ON CONFLICT DO UPDATE) — se puede correr de nuevo sin riesgo si cambian
// los env vars de origen. Después de esta siembra, un cliente nuevo se agrega con un INSERT
// directo a la tabla (o llamando a upsertTechAgent desde un script similar a este), sin deploy.
import { upsertTechAgent } from "./integrations/postgres/tech-agents.js";
import { closePostgres } from "./integrations/postgres/client.js";
import { logger } from "./config/logger.js";

async function main(): Promise<void> {
  const seed = {
    empresa: "Spectrum",
    slackChannel: process.env.TECH_AGENT_SPECTRUM_CHANNEL || "tecnico-spectrum",
    slackBotUserId: process.env.TECH_AGENT_SPECTRUM_BOT_USER_ID || "",
  };

  if (!seed.slackBotUserId) {
    logger.warn("TECH_AGENT_SPECTRUM_BOT_USER_ID no está seteado — se sembrará con slackBotUserId vacío");
  }

  await upsertTechAgent(seed);
  logger.info({ seed }, "tech_agents sembrada");
}

main()
  .catch((err) => {
    logger.error({ err }, "Falló la siembra de tech_agents");
    process.exitCode = 1;
  })
  .finally(() => closePostgres());
