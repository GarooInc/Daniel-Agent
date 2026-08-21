import bolt from "@slack/bolt";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { registerMessageHandler, handleResolvedMessage } from "./message-handler.js";
import { registerTechAgentResponseHandler } from "./tech-agent-response-handler.js";
import { startDebounceWorker, closeDebounceQueue } from "../../messaging/debounce-queue.js";
import { closeRedis, getRedis } from "../../integrations/redis/client.js";
import { getPool } from "../../integrations/postgres/client.js";
import { startRetentionCleanup } from "../../integrations/postgres/retention.js";
import { startWebhookServer } from "../webhook/index.js";
import { connectRealtime, disconnectRealtime } from "../../integrations/redtec-realtime/client.js";

const { App } = bolt;

export async function startSlackBot(): Promise<void> {
  const app = new App({
    token: env.slackBotToken,
    appToken: env.slackAppToken,
    signingSecret: env.slackSigningSecret,
    socketMode: true,
  });

  const auth = await app.client.auth.test();
  registerMessageHandler(app, auth.user_id as string);
  registerTechAgentResponseHandler(app, auth.user_id as string);

  const worker = startDebounceWorker(async (_source, slackUserId, channelId, texto) => {
    await handleResolvedMessage(app.client, slackUserId, channelId, texto, (text) =>
      app.client.chat.postMessage({ channel: channelId, text }),
    );
  });

  const webhookServer = startWebhookServer();

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Cerrando Daniel...");
    await closeDebounceQueue(worker);
    await closeRedis();
    webhookServer.close();
    disconnectRealtime();
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Calentamiento de Postgres ANTES de aceptar mensajes de Slack — mismo motivo que tenía el
  // calentamiento de Mongo antes del corte a Postgres (bug real en vivo, 2026-08-06): sin esto,
  // la primera conexión (lazy, recién se dispara con el primer mensaje real) corre la carrera
  // contra el timeout de conexión en un contenedor recién arrancado, y el primer cliente después
  // de cada redeploy se come el fallo. Si igual falla acá, no se aborta el arranque — sigue
  // funcionando el reintento en el próximo getPool() (client.ts ya lo soporta). `integrations/mongo/`
  // ya no se usa en el camino real (ver plans/2026-08-18-migracion-postgresql-pgvector.md, paso 7) —
  // queda en el repo sin borrar, como red de rollback.
  try {
    await getPool();
    startRetentionCleanup();
    logger.info("Postgres conectado (calentamiento ok)");
  } catch (err) {
    logger.error({ err }, "No se pudo calentar la conexión a Postgres al arrancar — se reintentará en el próximo mensaje");
  }

  // No bloqueante a propósito: si RedTec todavía no confirmó URL/secreto, esto no hace nada
  // (ver client.ts) y el resto del arranque sigue igual.
  connectRealtime();

  await app.start();
  logger.info("⚡️ Daniel está corriendo (Slack Socket Mode)");

  getRedis()
    .ping()
    .then(() => logger.info("Redis conectado (ping ok)"))
    .catch((err) => logger.error({ err }, "No se pudo conectar a Redis"));
}
