import bolt from "@slack/bolt";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { registerMessageHandler, handleResolvedMessage } from "./message-handler.js";
import { startDebounceWorker, closeDebounceQueue } from "../../messaging/debounce-queue.js";
import { closeRedis, getRedis } from "../../integrations/redis/client.js";

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

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Cerrando Daniel...");
    await closeDebounceQueue(worker);
    await closeRedis();
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.start();
  logger.info("⚡️ Daniel está corriendo (Slack Socket Mode)");

  getRedis()
    .ping()
    .then(() => logger.info("Redis conectado (ping ok)"))
    .catch((err) => logger.error({ err }, "No se pudo conectar a Redis"));
}
