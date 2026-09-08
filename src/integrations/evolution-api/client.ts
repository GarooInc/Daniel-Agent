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

  // Namespace por instancia (`{url}/{instance}`, no la raíz) y API key por header HTTP del
  // handshake WS (`extraHeaders`, no query ni `auth`) — confirmado por Fernando 2026-09-08 con
  // el cliente real de api-mainrealstate, que es el mismo patrón (Socket.IO puro, no un
  // WebSocket nativo como se sospechaba antes). `transports: ["websocket"]` fuerza el upgrade
  // directo sin el polling HTTP inicial de Engine.IO, igual que api-mainrealstate.
  socket = io(`${env.whatsappEvolutionUrl}/${env.whatsappEvolutionInstance}`, {
    transports: ["websocket"],
    extraHeaders: { apikey: env.whatsappEvolutionApiKey },
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
