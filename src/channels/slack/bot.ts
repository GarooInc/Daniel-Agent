import bolt from "@slack/bolt";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { registerMessageHandler, handleResolvedMessage } from "./message-handler.js";
import { startDebounceWorker, closeDebounceQueue } from "../../messaging/debounce-queue.js";
import { closeRedis, getRedis } from "../../integrations/redis/client.js";
import { getDb } from "../../integrations/mongo/client.js";
import { startWebhookServer } from "../webhook/index.js";

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

  const worker = startDebounceWorker(async (_source, slackUserId, channelId, texto) => {
    await handleResolvedMessage(app.client, slackUserId, texto, (text) =>
      app.client.chat.postMessage({ channel: channelId, text }),
    );
  });

  const webhookServer = startWebhookServer();

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Cerrando Daniel...");
    await closeDebounceQueue(worker);
    await closeRedis();
    webhookServer.close();
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Calentamiento de Mongo ANTES de aceptar mensajes de Slack — bug real en vivo (2026-08-06):
  // sin esto, la primera conexión a Mongo (lazy, recién se dispara con el primer mensaje real)
  // corría la carrera contra el timeout de selección del replica set en un contenedor recién
  // arrancado, y el primer cliente después de cada redeploy se comía el fallo. Si igual falla acá
  // (ver también el serverSelectionTimeoutMS más largo en client.ts), no se aborta el arranque —
  // sigue funcionando el reintento en el próximo getDb() (client.ts ya lo soporta).
  try {
    await getDb();
    logger.info("Mongo conectado (calentamiento ok)");
  } catch (err) {
    logger.error({ err }, "No se pudo calentar la conexión a Mongo al arrancar — se reintentará en el próximo mensaje");
  }

  await app.start();
  logger.info("⚡️ Daniel está corriendo (Slack Socket Mode)");

  getRedis()
    .ping()
    .then(() => logger.info("Redis conectado (ping ok)"))
    .catch((err) => logger.error({ err }, "No se pudo conectar a Redis"));
}
