import { getRealtimeSocket } from "./client.js";

// Únicos nombres de contenedor válidos según la guía de RedTec — se rechaza cualquier otro
// acá mismo, antes de tocar el socket (el servidor también valida, pero doble check no cuesta
// nada y evita depender solo de eso).
export const VALID_CONTAINERS = ["redtec-realstate-api", "redtec-realstate-ux"] as const;
export type ContainerName = (typeof VALID_CONTAINERS)[number];

export type ContainerLogsResult = { ok: true; logs: string } | { ok: false; error: string };

// Deliberadamente NO expuesta como tool del agente (ver plan de integración realtime): un log
// crudo de contenedor puede traer stack traces, IPs internas o datos de otro tenant que hayan
// quedado logueados — dárselo a un LLM en una conversación con un cliente externo es un vector
// de fuga de datos. Esta función existe como utilidad interna (uso manual/futuro, ej. un
// script o un flujo solo-interno) y no está conectada a agent/tools/index.ts. A diferencia de
// las métricas (que se guardan solas cada 30s), los logs se piden puntuales bajo demanda —
// esta es la única pieza de esta integración que sí habla con el socket en el momento.
export async function requestContainerLogs(container: ContainerName, lines = 200): Promise<ContainerLogsResult> {
  if (!VALID_CONTAINERS.includes(container)) {
    return { ok: false, error: `Contenedor no permitido: ${container}` };
  }

  const socket = getRealtimeSocket();
  if (!socket) {
    return { ok: false, error: "Realtime de RedTec no conectado" };
  }

  return new Promise((resolve) => {
    socket.emit("get_container_logs", { container, lines }, (res: ContainerLogsResult) => {
      resolve(res && typeof res === "object" ? res : { ok: false, error: "Respuesta inválida del servidor de realtime" });
    });
  });
}
