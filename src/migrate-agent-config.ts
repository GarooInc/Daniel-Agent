// Script de un solo uso: siembra `daniel_agent_config` (fila id=1) con el system prompt que hoy
// vive hardcodeado en agent/prompt.ts, para que exista una fila real antes de que
// Support-Agent-Panel empiece a leerla/escribirla. Idempotente (ON CONFLICT DO NOTHING dentro
// de seedAgentConfigIfMissing) — correrlo de nuevo no pisa cambios ya guardados desde el panel.
import { seedAgentConfigIfMissing } from "./integrations/postgres/agent-config.js";
import { closePostgres } from "./integrations/postgres/client.js";
import { logger } from "./config/logger.js";

async function main(): Promise<void> {
  await seedAgentConfigIfMissing();
  logger.info("daniel_agent_config sembrada (o ya existía)");
}

main()
  .catch((err) => {
    logger.error({ err }, "Falló la siembra de daniel_agent_config");
    process.exitCode = 1;
  })
  .finally(() => closePostgres());
