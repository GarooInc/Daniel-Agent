import { io, type Socket } from "socket.io-client";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { recordContainerStats, type ContainerStatsPayload } from "./platform-metrics.js";
import { recordPlatformEvent, type PlatformEventType } from "./crm-events-cache.js";

// Un único socket de plataforma, no uno por tenant (ver guía de RedTec): todos los tenants
// llegan por esta misma conexión, identificados por `tenantId` dentro de cada payload de CRM.
let socket: Socket | undefined;

const CRM_EVENT_TYPES: PlatformEventType[] = ["lead.created", "lead.stage_changed", "appointment.created", "appointment.cancelled"];

// Llamada una vez al boot (ver channels/slack/bot.ts), idempotente. Si no hay URL/secreto
// configurados todavía (RedTec no los confirmó, ver config/env.ts), no intenta conectar y el
// resto del bot sigue funcionando igual — esta integración es aditiva, nunca bloqueante.
export function connectRealtime(): void {
  if (socket) return;
  if (!env.redtecRealtimeUrl || !env.redtecRealtimeSecret) {
    logger.info("Realtime de RedTec deshabilitado (faltan REDTEC_PLATFORM_WS_URL/REDTEC_PLATFORM_WS_SECRET)");
    return;
  }

  socket = io(env.redtecRealtimeUrl, {
    path: "/realtime",
    auth: { secret: env.redtecRealtimeSecret },
  });

  // La guía de RedTec es ambigua sobre el nombre de esta variable (ver config/env.ts) — se
  // loguea cuál de las dos terminó resolviéndose para poder confirmar en Coolify sin adivinar.
  const secretVarUsed = process.env.REDTEC_PLATFORM_WS_SECRET ? "REDTEC_PLATFORM_WS_SECRET" : "SUPPORT_AGENT_WEBHOOK_SECRET";
  socket.on("connect", () => logger.info({ secretVarUsed }, "Realtime de RedTec conectado"));
  // La reconexión ante cortes de red la maneja socket.io solo (confirmado en la guía) — no
  // hace falta lógica propia de retry acá.
  socket.on("disconnect", (reason) => logger.warn({ reason }, "Realtime de RedTec desconectado (reintenta solo)"));
  socket.on("connect_error", (err) => logger.error({ err }, "Error de conexión al realtime de RedTec"));

  // Todo lo que llega se persiste en Mongo apenas llega — nunca se consulta el socket "en
  // vivo" al momento de responderle a un cliente (ver platform-metrics.ts). Best-effort: un
  // fallo de Mongo acá solo se loguea, nunca corta la conexión del socket.
  socket.on("container.stats", (payload: ContainerStatsPayload) => {
    recordContainerStats(payload).catch((err) => logger.warn({ err }, "No se pudo guardar container.stats"));
  });

  for (const eventType of CRM_EVENT_TYPES) {
    socket.on(eventType, (payload: unknown) => {
      recordPlatformEvent(eventType, payload).catch((err) => logger.warn({ err, eventType }, "No se pudo guardar evento de plataforma"));
    });
  }
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = undefined;
}

// Para container-logs.ts únicamente (pedir logs puntuales bajo demanda) — no lo use nada
// más, y en particular ninguna tool del agente (ver container-logs.ts para el porqué).
export function getRealtimeSocket(): Socket | undefined {
  return socket;
}
