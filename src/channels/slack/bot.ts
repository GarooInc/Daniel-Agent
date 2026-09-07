import bolt from "@slack/bolt";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { registerMessageHandler, handleResolvedMessage } from "./message-handler.js";
import { registerTechAgentResponseHandler } from "./tech-agent-response-handler.js";
import { startTechAgentTimeoutChecker } from "../../agent/tech-agent-timeout.js";
import { startDebounceWorker, closeDebounceQueue } from "../../messaging/debounce-queue.js";
import { closeRedis, getRedis } from "../../integrations/redis/client.js";
import { getPool } from "../../integrations/postgres/client.js";
import { startRetentionCleanup } from "../../integrations/postgres/retention.js";
import { startFaqEmbeddingSync } from "../../integrations/postgres/faq-embedding-sync.js";
import { startHeartbeat } from "../../integrations/postgres/heartbeat.js";
import { startWebhookServer } from "../webhook/index.js";
import { connectRealtime, disconnectRealtime } from "../../integrations/redtec-realtime/client.js";
import { connectWhatsapp, disconnectWhatsapp, handleResolvedWhatsappMessage } from "../whatsapp/index.js";

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

  // Un único worker de debounce para todos los canales (Slack + WhatsApp) — se rutea por
  // `source` acá en vez de tener una cola separada por canal, mismo mecanismo que ya evita que
  // se mezclen mensajes de un mismo usuario en dos canales distintos (ver
  // messaging/debounce-queue.ts, bug del punto 16 de ESTADO-PROYECTO.md).
  const worker = startDebounceWorker(async (source, slackUserId, channelId, texto) => {
    if (source === "whatsapp") {
      await handleResolvedWhatsappMessage(slackUserId, texto); // acá slackUserId === channelId === group_jid
      return;
    }
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
    disconnectWhatsapp();
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
  // (la red de rollback de la migración, ver plans/2026-08-18-migracion-postgresql-pgvector.md,
  // paso 7) ya se borró del repo tras unos días sin sorpresas en vivo (2026-08-22).
  try {
    await getPool();
    startRetentionCleanup();
    startFaqEmbeddingSync();
    startHeartbeat();
    logger.info("Postgres conectado (calentamiento ok)");
  } catch (err) {
    logger.error({ err }, "No se pudo calentar la conexión a Postgres al arrancar — se reintentará en el próximo mensaje");
  }

  // No bloqueante a propósito: si RedTec todavía no confirmó URL/secreto, esto no hace nada
  // (ver client.ts) y el resto del arranque sigue igual.
  connectRealtime();
  // Ídem para WhatsApp: sin WHATSAPP_EVOLUTION_URL/API_KEY configuradas, no hace nada (ver
  // integrations/evolution-api/client.ts).
  connectWhatsapp();

  await app.start();
  logger.info("⚡️ Daniel está corriendo (Slack Socket Mode)");

  startTechAgentTimeoutChecker(app.client);

  getRedis()
    .ping()
    .then(() => logger.info("Redis conectado (ping ok)"))
    .catch((err) => logger.error({ err }, "No se pudo conectar a Redis"));
}
