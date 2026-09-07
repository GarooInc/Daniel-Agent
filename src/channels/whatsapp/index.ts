import { connectEvolutionSocket, disconnectEvolutionSocket } from "../../integrations/evolution-api/client.js";
import { registerMessageHandler } from "./message-handler.js";

export { handleResolvedWhatsappMessage } from "./message-handler.js";

// No bloqueante a propósito: si las credenciales de Evolution API todavía no están cargadas
// (ver config/env.ts), connectEvolutionSocket() no hace nada y el resto del arranque sigue
// igual — mismo principio que connectRealtime() para el WebSocket de RedTec.
export function connectWhatsapp(): void {
  const socket = connectEvolutionSocket();
  if (!socket) return;
  registerMessageHandler(socket);
}

export function disconnectWhatsapp(): void {
  disconnectEvolutionSocket();
}
