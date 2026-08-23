// Slack Events API puede reenviar el mismo evento de mensaje si no se acusa recibo a tiempo
// (askDaniel + tools externas pueden tardar más de los ~3s que Slack espera) — bug real ya
// encontrado una vez con tickets duplicados (ver ESTADO-PROYECTO.md). Compartido entre
// message-handler.ts y tech-agent-response-handler.ts, que corren sobre el mismo evento
// `message` de Bolt para un mensaje del Técnico que menciona a Daniel — cada uno namespacea su
// `eventId` (`customer:`/`tech:`) para no pisarse la marca de dedupe entre sí (bug real
// encontrado, ver ESTADO-PROYECTO.md pendiente #12): sin el prefijo, el handler que corre
// primero "gastaba" la única entrada del mapa para ese client_msg_id y el otro nunca llegaba a
// procesar el mensaje.
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
