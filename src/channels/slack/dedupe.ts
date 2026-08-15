// Slack Events API puede reenviar el mismo evento de mensaje si no se acusa recibo a tiempo
// (askDaniel + tools externas pueden tardar más de los ~3s que Slack espera) — bug real ya
// encontrado una vez con tickets duplicados (ver ESTADO-PROYECTO.md). Compartido entre
// message-handler.ts y tech-agent-response-handler.ts para no duplicar la misma ventana de dedupe.
const DEFAULT_TTL_MS = 60_000;
const processedEvents = new Map<string, number>();

export function wasAlreadyProcessed(eventId: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  const now = Date.now();
  for (const [id, seenAt] of processedEvents) {
    if (now - seenAt > ttlMs) processedEvents.delete(id);
  }

  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}
