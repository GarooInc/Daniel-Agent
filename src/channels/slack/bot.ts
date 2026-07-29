import bolt from "@slack/bolt";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { registerMessageHandler } from "./message-handler.js";

const { App } = bolt;

export async function startSlackBot(): Promise<void> {
  const app = new App({
    token: env.slackBotToken,
    appToken: env.slackAppToken,
    signingSecret: env.slackSigningSecret,
    socketMode: true,
  });

  registerMessageHandler(app);

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Cerrando Daniel...");
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.start();
  logger.info("⚡️ Daniel está corriendo (Slack Socket Mode)");
}
