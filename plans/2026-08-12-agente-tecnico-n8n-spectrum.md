# Plan: Agente Técnico para Daniel (caso guía: Spectrum / n8n) vía canal Slack compartido

## Contexto

Hoy Daniel solo puede resolver con su base de conocimiento o escalar a un ticket de Monday.
No tiene forma de investigar un problema técnico real en un sistema que RedTec opera para un
cliente (ej. Spectrum: un chatbot implementado como flujos de n8n en un VPS). Cuando Spectrum
reporta un problema con su chatbot, Daniel no puede diagnosticarlo ni saber qué pasó.

La idea (de Jorge): un segundo agente de IA —"Agente Técnico"— con acceso vía MCP a la
instancia de n8n de Spectrum, que viva en Slack junto a Daniel en un **canal compartido**
visible para humanos de RedTec (pensado para escalar a más agentes de la empresa en el
futuro). Daniel delega ahí el diagnóstico mencionando al agente técnico; el agente técnico
audita n8n y responde en el mismo hilo; Daniel toma esa respuesta y le contesta al cliente en
la conversación original. Todo el intercambio entre agentes queda visible en el canal
compartido, no es un backchannel oculto. Human-in-the-loop y acciones de escritura sobre n8n
quedan fuera de este MVP, a agregar después.

Este documento es el plan de la Fase 1 (MVP). Se commitea a `plans/` en el repo `Daniel-Agent`
(convención ya existente, ver `plans/2026-08-06-redtec-realtime-websocket.md` y
`plans/2026-08-12-roadmap-premium-profesional.md`) para poder retomarlo desde cualquier
máquina. **Estado: solo diseño, sin código todavía** — ver `ESTADO-PROYECTO.md`, sección
Pendientes, para el punto de entrada cuando se retome.

## Decisiones ya tomadas (no reabrir)

1. **Repo separado**: el agente técnico vive en un repo nuevo (`Agente-Tecnico`), mismo stack
   que Daniel (Node+TS+LangChain.js+`@slack/bolt` Socket Mode) pero deploy/env/ciclo de vida
   100% independientes.
2. **MVP de n8n = solo lectura/diagnóstico**. Nada de crear/editar/activar/desactivar workflows
   ni re-disparar ejecuciones. Eso es Fase 2+, con human-in-the-loop.
3. **Gating por cliente**: la tool nueva de Daniel solo se ofrece si el cliente es Spectrum (o
   si todavía no se conoce su perfil, para no bloquear el primer contacto) — chequeo
   determinístico en código, no solo el juicio del LLM. Evita que Daniel intente consultar al
   agente técnico por un cliente sin n8n/agente técnico configurado.

## Investigación externa que sostiene el diseño

- **n8n-mcp** (`czlonkowski/n8n-mcp`, github.com/czlonkowski/n8n-mcp): servidor MCP maduro que
  expone la API de gestión de n8n. Tools relevantes para el MVP (solo lectura): `search_nodes`,
  `get_node`, `n8n_get_workflow`, `list_executions` (filtra por workflowId/status/rango de
  tiempo), `get_execution` (info completa: datos de nodos, errores, metadata),
  `execution_explain` (dado el JSON de una ejecución, devuelve hallazgos por nodo: qué nodos
  devolvieron 0 items, expresiones sin resolver, errores con hints). Requiere `N8N_API_URL` y
  `N8N_API_KEY` de la instancia n8n objetivo. También tiene tools de escritura
  (`n8n_create_workflow`, `n8n_update_full_workflow`, etc.) — deliberadamente no habilitadas en
  el MVP.
- **`@langchain/mcp-adapters`** (paquete oficial LangChain.js): `MultiServerMCPClient` se
  conecta a servidores MCP (stdio o HTTP) y expone sus tools ya adaptadas a `bindTools()` —
  mismo patrón de tool-calling manual que ya usa `daniel.ts`.

---

## A. Lado Daniel (`Daniel-Agent`, este repo)

### A.1 — Tool nueva `consultar_agente_tecnico`

Archivo nuevo: `src/agent/tools/consult-tech-agent.ts`, mismo patrón factory que
`src/agent/tools/escalate-to-monday.ts` (necesita `client` de Slack, `slackUserId`,
`originalChannelId`, y el perfil del cliente para el gating).

```ts
export function createConsultTechAgentTool(
  client: WebClient,
  slackUserId: string,
  originalChannelId: string,
) {
  return tool(
    async ({ resumenProblema }) => {
      const channelId = await resolveChannelId(env.slackAgentsChannel);
      if (!channelId || !env.slackTechAgentUserId) {
        return "No tengo forma de contactar al equipo técnico en este momento.";
      }

      const posted = await client.chat.postMessage({
        channel: channelId,
        text: `<@${env.slackTechAgentUserId}> necesito tu ayuda con un cliente.\n\n` +
              `*Problema reportado:*\n${resumenProblema}\n\nRespondé en este hilo cuando tengas un diagnóstico.`,
      });

      await createHandoff({
        threadTs: posted.ts as string,
        sharedChannelId: channelId,
        originalSlackUserId: slackUserId,
        originalChannelId,
        resumenProblema,
      });
      await scheduleHandoffTimeout(posted.ts as string);

      return "Ya le pasé el caso al equipo técnico. Avisale al cliente que estás investigando — la respuesta te va a llegar después, no en este turno.";
    },
    {
      name: "consultar_agente_tecnico",
      description:
        "Consulta al equipo técnico interno cuando el cliente reporta un problema concreto en " +
        "una automatización/integración propia (no en los productos estándar), y no hay FAQ que " +
        "lo resuelva. La respuesta NO llega en este turno.",
      schema: z.object({
        resumenProblema: z.string().describe(
          "Resumen completo: qué hace la automatización, qué error/comportamiento ve el cliente, desde cuándo.",
        ),
      }),
    },
  );
}
```

**Gating por cliente (decisión #3)**: en `daniel.ts`, antes de armar `toolsByName`, solo incluir
esta tool en el bind del modelo si `profile?.empresa` coincide (case-insensitive) con
`env.techAgentClienteSoportado` ("Spectrum"), o si `profile` todavía no existe. `buildModel()`
ya se reconstruye desde cero en cada `askDaniel()` (`daniel.ts:51`), así que alcanza con
parametrizar qué tools se bindean por sesión — no hace falta reestructurar el loop.

**Cambio de firma en cascada**: `askDaniel()` hoy es `askDaniel(userMessage, slackUserId)`
(`daniel.ts:50`) y no recibe `client` ni `channelId` — la tool nueva los necesita. Hay que
extender la firma a `askDaniel(userMessage, slackUserId, client, channelId)` y propagarlo desde
`handleResolvedMessage()` (`message-handler.ts:26-34`, ya recibe `client`) y sus dos callers
(el handler de mensaje entrante y el flush del debounce en `bot.ts`) — ambos ya tienen
`channelId`/`client` disponibles en su closure, solo falta pasarlos explícitamente.

Para el array estático `tools` de `model.ts` (solo para `bindTools()`, sin implementación real
— ver `tools/index.ts:25`), usar la misma instancia "dummy" que ya existe para
`escalar_a_monday` (`"__schema_binding__"`).

### A.2 — Persistencia del handoff en Mongo

Archivo nuevo: `src/integrations/mongo/tech-agent-handoff.ts`, mismo patrón CRUD simple que
`ticket-draft.ts`.

```ts
export type TechAgentHandoffStatus = "pending" | "answered" | "timeout";

export type TechAgentHandoffDoc = {
  threadTs: string;            // ts del mensaje que Daniel posteó — clave de correlación
  sharedChannelId: string;
  originalSlackUserId: string; // cliente (Spectrum)
  originalChannelId: string;   // DM o canal donde responderle al cliente
  resumenProblema: string;
  status: TechAgentHandoffStatus;
  causaRaiz?: string;
  componenteAfectado?: string;
  respuestaCruda?: string;
  createdAt: Date;
  answeredAt?: Date;
};

// índice único sobre threadTs — es la única query real de esta colección
export async function createHandoff(fields: Omit<TechAgentHandoffDoc, "status" | "createdAt">): Promise<void>;
export async function findPendingHandoffByThreadTs(threadTs: string): Promise<TechAgentHandoffDoc | null>;
export async function markHandoffAnswered(threadTs: string, respuestaCruda: string, causaRaiz?: string, componenteAfectado?: string): Promise<void>;
export async function markHandoffTimeout(threadTs: string): Promise<void>;
```

### A.3 — Detectar la respuesta del agente técnico (correlación por `thread_ts`)

Hoy `message-handler.ts` no usa `thread_ts` ni distingue `message.bot_id`. Se agrega un
**handler nuevo y separado** (no se mezcla con `registerMessageHandler`, mismo principio de
módulos de propósito único que ya siguen `notify-escalation.ts`/`create-ticket.ts`).

Archivo nuevo: `src/channels/slack/tech-agent-response-handler.ts`

```ts
export function registerTechAgentResponseHandler(app: App, sharedChannelId: string, ownBotId: string): void {
  app.message(async ({ message, client }) => {
    if (!("channel" in message) || message.channel !== sharedChannelId) return;
    if (!("bot_id" in message) || !message.bot_id) return;       // solo respuestas de bots
    if (message.bot_id === ownBotId) return;                     // ignorar los propios posts de Daniel
    if (!("thread_ts" in message) || !message.thread_ts) return; // solo respuestas en hilo

    const handoff = await findPendingHandoffByThreadTs(message.thread_ts);
    if (!handoff) return; // hilo no rastreado (charla suelta, u otro agente) — ignorar

    const texto = "text" in message ? message.text ?? "" : "";
    await deliverTechAgentDiagnosis(client, handoff, texto);
  });
}
```

`ownBotId` es el **`bot_id`** de Daniel (no el `user_id` que ya se usa hoy) — `auth.test()`
también lo devuelve; hay que capturarlo en `bot.ts` junto al `user_id` existente y registrar
este handler nuevo ahí mismo, con el canal compartido resuelto una vez al boot.

### A.4 — Extracción confiable + respuesta diferida al cliente

Archivo nuevo: `src/agent/extract-tech-diagnosis.ts`, mismo patrón `withStructuredOutput` que
`extract-ticket-fields.ts` (modelo secundario, corre en paralelo, con validación
determinística):

```ts
const DiagnosisSchema = z.object({
  causaRaiz: z.string().optional(),
  componenteAfectado: z.string().optional(),
  resuelto: z.boolean().describe("true si el diagnóstico es concreto y accionable"),
  resumenParaCliente: z.string().describe(
    "Explicación simple, SIN jerga de n8n (sin nombres de nodos, IDs, JSON), lista para el cliente final.",
  ),
});
export async function extractTechDiagnosis(mensajeAgenteTecnico: string): Promise<z.infer<typeof DiagnosisSchema>>;
```

Separar `causaRaiz`/`componenteAfectado` (uso interno) de `resumenParaCliente` es deliberado:
la jerga interna de n8n no debe llegarle a Spectrum.

Archivo nuevo: `src/agent/tech-agent-handoff.ts` — entrega diferida, reusando el patrón de
"postear fuera del ciclo del evento entrante" que ya usa `handleResolvedMessage`/
`debounce-queue.ts`:

```ts
export async function deliverTechAgentDiagnosis(client: WebClient, handoff: TechAgentHandoffDoc, textoAgenteTecnico: string): Promise<void> {
  const diagnosis = await extractTechDiagnosis(textoAgenteTecnico);
  await markHandoffAnswered(handoff.threadTs, textoAgenteTecnico, diagnosis.causaRaiz, diagnosis.componenteAfectado);

  const mensajeFinal = diagnosis.resuelto
    ? `Nuestro equipo técnico revisó tu caso: ${diagnosis.resumenParaCliente}`
    : `Nuestro equipo técnico está investigando tu caso. Por ahora: ${diagnosis.resumenParaCliente}`;

  await client.chat.postMessage({ channel: handoff.originalChannelId, text: toSlackMrkdwn(mensajeFinal) });
  await appendMessage(handoff.originalSlackUserId, "ai", mensajeFinal); // no perder continuidad en chat_histories
}
```

No se reinvoca `askDaniel()` completo — sería un tool-loop innecesario sobre una respuesta ya
determinística, consistente con la filosofía del proyecto de preferir lo determinístico sobre
confiar en que el LLM "decida bien" (ver comentarios de `daniel.ts` y `ticket-fields.ts` sobre
bugs reales de eso).

### A.5 — Timeout si el agente técnico no responde

Archivo nuevo: `src/messaging/tech-agent-timeout-queue.ts`, mismo patrón BullMQ+Redis que
`debounce-queue.ts` pero con delay largo (default 15 min, configurable) en vez de debounce
corto. El worker chequea `status !== "pending"` antes de actuar — si ya se respondió a tiempo,
es un no-op. Si expira: marca `timeout`, avisa al cliente que "seguimos investigando", y posta
un aviso visible en el hilo del canal compartido para que humanos lo noten.

### A.6 — Env vars nuevas en `Daniel-Agent`

Agregar a `config/env.ts`, **no** en `REQUIRED_ENV_VARS` (mismo criterio que
`redtecRealtimeUrl`: la feature debe ser aditiva, el bot arranca igual sin esto):

```ts
slackAgentsChannel: process.env.SLACK_AGENTS_CHANNEL || "agentes-ia",
slackTechAgentUserId: process.env.SLACK_TECH_AGENT_USER_ID,
techAgentClienteSoportado: process.env.TECH_AGENT_CLIENTE_SOPORTADO, // "Spectrum"
techAgentTimeoutMs: process.env.TECH_AGENT_TIMEOUT_MS ? Number(process.env.TECH_AGENT_TIMEOUT_MS) : undefined,
```

**Refactor chico sugerido**: extraer el `resolveChannelId` cacheado de `notify-escalation.ts`
a `src/integrations/slack/resolve-channel.ts` genérico (parámetro: nombre de canal), para no
duplicar la lógica de paginación+caché en la tool nueva.

---

## B. Lado Agente Técnico (repo nuevo `Agente-Tecnico`)

### B.1 — Estructura

```
Agente-Tecnico/
  src/
    index.ts
    config/{env.ts, logger.ts}
    channels/slack/{bot.ts, message-handler.ts, format.ts}
    agent/{tech-agent.ts, model.ts, prompt.ts}
    integrations/n8n-mcp/client.ts
  package.json / tsconfig.json / Dockerfile / docker-compose.yml / .env.example
```

**Sin Mongo/Redis/BullMQ en el MVP**: cada mención de Daniel es autocontenida (manda el
`resumenProblema` completo), y si hace falta memoria de turnos dentro del mismo hilo, se lee
con `conversations.replies({ channel, ts: threadTs })` en cada invocación — el propio hilo de
Slack es la memoria. Menos piezas operativas para un repo nuevo que mantiene una sola persona.
Fase 2 agrega Mongo si hace falta memoria cross-hilo.

### B.2 — Conexión a n8n-mcp

Transporte **stdio**, spawneado por `MultiServerMCPClient` (no un sidecar HTTP separado —
menos piezas para el MVP; migrar a HTTP en Fase 2 si hace falta multi-tenant):

```ts
const READ_ONLY_TOOL_NAMES = [
  "search_nodes", "get_node", "n8n_get_workflow",
  "list_executions", "get_execution", "execution_explain",
] as const; // hardcodeado en código, no en env — es alcance de producto, no config de deploy

export async function getN8nMcpTools() {
  const client = new MultiServerMCPClient({
    n8n: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "n8n-mcp"],
      env: { N8N_API_URL: env.n8nApiUrl ?? "", N8N_API_KEY: env.n8nApiKey ?? "" },
    },
  });
  const allTools = await client.getTools();
  return allTools.filter((t) => READ_ONLY_TOOL_NAMES.includes(t.name as any));
}
```

Env vars del repo nuevo: `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET` (app de
Slack propia y distinta), `SLACK_AGENTS_CHANNEL` (mismo nombre de canal que Daniel, resuelto
por su cuenta), `N8N_API_URL`, `N8N_API_KEY` (instancia de Spectrum), `OPENROUTER_API_KEY`.

### B.3 — System prompt (borrador, a iterar)

Reglas centrales: (1) solo lectura, nunca ofrecer crear/modificar/activar/re-disparar nada;
(2) si no hay evidencia concreta de las tools, decir "no pude confirmar la causa" en vez de
inventar; (3) separar en la respuesta "qué encontré con evidencia" de "conclusión en lenguaje
simple sin jerga de n8n, lista para reenviar al cliente"; (4) responder siempre en el mismo
hilo donde lo mencionaron.

### B.4/B.5 — Escucha y respuesta

Mismo patrón `app.message` + filtro de mención que `message-handler.ts` de Daniel, pero
acotado al canal compartido y sin necesidad de exigir mención en DM (este bot no tiene DMs).
Ignora sus propios mensajes (`bot_id` propio) para evitar loops. Responde siempre con
`thread_ts` = el hilo donde lo mencionaron (heredado si ya existía, o el `ts` del mensaje si
es el primero).

---

## C. Fases y esfuerzo

**Fase 1 (este plan)**: handoff de un solo sentido, un solo cliente (Spectrum), Daniel decide y
delega, agente técnico solo lee/diagnostica n8n, todo visible en el canal compartido, timeout
simple, sin acciones de escritura.

**Fase 2+ (no diseñado en detalle, para no bloquear el MVP)**:
- Human-in-the-loop: aprobación humana antes de que Daniel envíe la respuesta final al cliente,
  y/o antes de cualquier acción de escritura futura del agente técnico sobre n8n.
- Múltiples agentes técnicos/clientes: tabla de routing `empresa → {slackUserId, n8nConfig}` en
  vez de un solo `SLACK_TECH_AGENT_USER_ID`/`N8N_API_URL` hardcodeado.
- Acciones de escritura sobre n8n (requiere habilitar tools de escritura de n8n-mcp + gate de
  aprobación humana).

**Estimación aproximada** (días de desarrollo efectivo, no calendario):

| Bloque | Días | Nota |
|---|---|---|
| Lado Daniel (tool, colección Mongo, threading handler, extracción, entrega diferida, timeout, tests, env) | 3–4 | Forma similar a `escalar_a_monday`, con la complejidad extra de correlación async |
| Repo Agente Técnico (scaffold completo desde cero) | 3–4 | Menos capas que Daniel, pero repo nuevo |
| Integración n8n-mcp + tuning de prompt/diagnóstico | 1–2 | Históricamente el mayor consumidor de tiempo real en este proyecto es iterar el prompt, no el código |
| Infra/Slack (app nueva, canal compartido, tokens, invitar bots, deploy Coolify del repo nuevo) | ~1 | Mayormente pasos manuales de Jorge |
| Verificación end-to-end con datos ficticios | ~1 | Ver sección D |

**Total aproximado: 9–12 días de trabajo efectivo.**

## D. Verificación sin depender de la n8n real de Spectrum

Mismo espíritu que `customers.json`/`faqs.json`: datos ficticios pero estructuralmente reales
antes de tener los reales.

1. **n8n local descartable** (`docker run n8nio/n8n`) con 2-3 workflows de juguete (uno que
   falle de forma predecible), `N8N_API_KEY` local — n8n-mcp apunta ahí. Ejercita el path real
   n8n-mcp↔API de n8n contra datos falsos, sin mockear el protocolo MCP.
2. **Stub in-process de las tools MCP** (mismo nombre/schema, respuestas scriptadas) para
   iterar rápido el loop de tool-calling del agente técnico sin levantar n8n en cada iteración.
3. **Canal/workspace de prueba** (ej. `agentes-ia-test`) con ambas apps de Slack instaladas en
   modo dev, para probar el handoff de punta a punta sin tocar producción.
4. **Test tipo `escalate-to-monday.test.ts` para el lado Daniel**: insertar un
   `tech_agent_handoffs` de prueba, invocar `deliverTechAgentDiagnosis()` con texto fijo, y
   verificar con Vitest que el mensaje final tiene el formato esperado, se llamó
   `appendMessage`, y el status pasó a `answered`. Valida la lógica de correlación sin Slack ni
   el agente técnico corriendo.

## Supuestos a confirmar con Jorge antes de construir (quedan documentados, no bloquean el plan)

1. `SLACK_TECH_AGENT_USER_ID` se obtiene a mano una sola vez (crear la app de Slack del agente
   técnico, instalarla, copiar su bot user ID al `.env` de Daniel) — no hay forma de
   descubrirlo dinámicamente sin ambigüedad.
2. Humanos de RedTec en el canal compartido podrían mencionar a `@Daniel` por curiosidad — hoy
   Daniel respondería igual que en cualquier canal (comportamiento ya existente). A confirmar
   si es aceptable o si hay que excluir ese canal del handler normal de Daniel.
3. Nombre del canal compartido: propuesto `agentes-ia` como default — confirmar el nombre real.
4. Timeout de 15 minutos es un valor arbitrario — confirmar cuánto es razonable.
5. Deploy del repo nuevo: se asume el mismo patrón que Daniel hoy (Coolify + `docker-compose.yml`
   propio) — confirmar que Jorge quiere replicar exactamente ese pipeline.

## Próximo paso inmediato al retomar

1. Empezar por el lado Daniel (sección A) — es el que tiene más código nuevo reusable y no
   depende de que el repo `Agente-Tecnico` exista todavía (se puede construir y testear con un
   handoff simulado antes de tener el otro repo funcionando).
2. Crear el repo `Agente-Tecnico` recién cuando el lado Daniel esté probado con un handoff
   simulado (ver sección D.4).
