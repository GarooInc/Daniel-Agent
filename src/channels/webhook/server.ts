import { createServer, type Server } from "node:http";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { saveWebhookEvent } from "../../integrations/postgres/webhook-events.js";
import { handleTicketStatusChanged } from "./ticket-status-handler.js";

// Ruta genérica para datos internos (otros agentes de RedTec, sistemas de la empresa) mientras
// no se conoce la estructura real de lo que va a llegar. Una vez que sepamos el origen y el
// shape del payload, esto se puede especializar o partir en rutas más específicas.
//
// Nota: hasta 2026-08-13 este servidor también despachaba body.type === "tech_agent_diagnosis"
// para correlacionar la respuesta del Agente Técnico — quedó superseded (ver
// plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección E.2): esa correlación pasó a ser
// 100% por Slack (ver channels/slack/tech-agent-response-handler.ts), no por este webhook.
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
        logger.error({ err }, "No se pudo guardar el evento del webhook en Postgres");
      });

      // Best-effort, no bloquea la respuesta 200: si el payload es un ticket.status_changed
      // conocido y hay una conversación correlacionada, avisa al cliente en Slack (ver
      // ticket-status-handler.ts). Cualquier otro tipo de evento se ignora acá (queda igual
      // logueado/persistido arriba).
      handleTicketStatusChanged(body).catch((err) => {
        logger.error({ err }, "Falló el aviso de cambio de estado de ticket");
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
