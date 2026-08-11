import { createServer, type Server } from "node:http";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { saveWebhookEvent } from "../../integrations/mongo/webhook-events.js";

// Ruta genérica para datos internos (otros agentes de RedTec, sistemas de la empresa) mientras
// no se conoce la estructura real de lo que va a llegar. Una vez que sepamos el origen y el
// shape del payload, esto se puede especializar o partir en rutas más específicas.
const ROUTE = "/webhook/internal";
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function startWebhookServer(): Server {
  const server = createServer((req, res) => {
    if (req.url !== ROUTE) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    if (env.webhookSecret && req.headers["x-webhook-secret"] !== env.webhookSecret) {
      logger.warn({ route: ROUTE }, "Webhook rechazado: secreto ausente o incorrecto");
      res.writeHead(401).end();
      return;
    }

    const chunks: Buffer[] = [];
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      chunks.push(chunk);
      if (chunks.reduce((total, c) => total + c.length, 0) > MAX_BODY_BYTES) {
        tooLarge = true;
        res.writeHead(413).end();
        req.destroy();
      }
    });

    req.on("end", () => {
      if (tooLarge) return;

      const rawBody = Buffer.concat(chunks).toString("utf-8");
      let parsed = true;
      let body: unknown = rawBody;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        parsed = false;
      }

      logger.info({ route: ROUTE, headers: req.headers, body, parsed }, "Webhook recibido");

      saveWebhookEvent(ROUTE, req.headers, rawBody, body, parsed).catch((err) => {
        logger.error({ err }, "No se pudo guardar el evento del webhook en Mongo");
      });

      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
    });

    req.on("error", (err) => {
      logger.error({ err }, "Error leyendo el body del webhook");
    });
  });

  server.listen(env.webhookPort, () => {
    logger.info({ port: env.webhookPort, route: ROUTE }, "Servidor de webhook escuchando");
  });

  return server;
}
