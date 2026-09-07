import { io, type Socket } from "socket.io-client";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

// Un único socket contra la instancia compartida `RedtecBot` (no uno por cliente — ver
// plans/2026-09-06-canal-whatsapp-evolution-api.md, punto 4): todos los grupos de todos los
// clientes que pasan por ese número llegan por esta misma conexión, identificados por su
// group_jid dentro de cada evento.
let socket: Socket | undefined;

// Llamada una vez al boot (ver channels/whatsapp/index.ts), idempotente. Si no hay
// URL/API key configuradas todavía, no intenta conectar y el resto del bot sigue funcionando
// igual — mismo principio que integrations/redtec-realtime/client.ts.
export function connectEvolutionSocket(): Socket | undefined {
  if (socket) return socket;
  if (!env.whatsappEvolutionUrl || !env.whatsappEvolutionApiKey) {
    logger.info("WhatsApp (Evolution API) deshabilitado (faltan WHATSAPP_EVOLUTION_URL/WHATSAPP_EVOLUTION_API_KEY)");
    return undefined;
  }

  // Namespace de instancia confirmado por Fernando (2026-09-06): Socket.io contra
  // `{url}/{instance}`. Probado en vivo (2026-09-07) contra la instancia real: mandar la key
  // solo por `auth` (mecanismo interno de Socket.IO, recién visible del lado del server DESPUÉS
  // del handshake de engine.io) daba 403 "apiKey is required" — Evolution API la valida en el
  // handshake HTTP mismo, así que tiene que ir en la query string de la conexión.
  socket = io(`${env.whatsappEvolutionUrl}/${env.whatsappEvolutionInstance}`, {
    query: { apikey: env.whatsappEvolutionApiKey },
  });

  socket.on("connect", () => logger.info("WhatsApp (Evolution API) conectado"));
  // Reconexión ante cortes de red la maneja socket.io solo (mismo comportamiento confirmado
  // para el realtime de RedTec) — no hace falta lógica propia de retry acá.
  socket.on("disconnect", (reason) => logger.warn({ reason }, "WhatsApp (Evolution API) desconectado (reintenta solo)"));
  socket.on("connect_error", (err) => logger.error({ err }, "Error de conexión a WhatsApp (Evolution API)"));

  return socket;
}

export function disconnectEvolutionSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
