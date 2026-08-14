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

### A.3 — Detectar la respuesta del agente técnico (webhook, no Slack) — **IMPLEMENTADO 2026-08-13, SUPERSEDIDO el mismo día**

> **SUPERSEDIDO (2026-08-13, más tarde el mismo día)**: esta sección describe lo que se
> **implementó y se commiteó** (`70a8ee8`), pero horas después, al decidir que el Agente
> Técnico va a ser una instancia de **Hermes Agent** (no un repo bespoke), se volvió sobre esta
> decisión — ver **sección E** más abajo para el diseño vigente (Slack con mención explícita,
> no webhook). El código de `handle-tech-agent-diagnosis.ts`/despacho en `server.ts` sigue en
> el repo tal cual quedó, pero **queda pendiente de revertir/reemplazar** por un listener de
> Slack — todavía no se tocó código, solo quedó documentado el cambio de rumbo (a propósito, así
> lo pidió Jorge). No reabrir esta sección A.3 como si siguiera vigente sin leer la sección E.

**Cambio respecto a la versión original de este plan**: la sección "Discusión de diseño" más
abajo identificaba que correlacionar por "cualquier mensaje de bot en el hilo de Slack" es
frágil (toma el primer mensaje narrado como si fuera el diagnóstico final) y que el canal
compartido, si es solo para que humanos *observen*, no necesita ser también el bus de
correlación máquina-a-máquina. Jorge resolvió el punto abierto (2026-08-13): **el canal
compartido es solo para narración visible a humanos, no para intervención en esta fase.** Se
separan los dos roles:

- **Slack (canal compartido)**: el Agente Técnico sigue posteando ahí su proceso/narración
  (`<@bot_id> encontré esto...`) — visible para humanos de RedTec, sin ningún efecto funcional
  en Daniel.
- **HTTP (webhook ya existente `POST /webhook/internal`, `src/channels/webhook/server.ts`)**:
  cuando el Agente Técnico termina, hace un POST ahí con la señal explícita e inequívoca de
  "diagnóstico listo":
  ```json
  { "type": "tech_agent_diagnosis", "threadTs": "<el mismo ts que Daniel posteó al abrir el handoff>", "mensaje": "<texto del diagnóstico>" }
  ```
  Autenticado con el mismo `X-Webhook-Secret: <WEBHOOK_SECRET>` que ya exige la ruta — no hace
  falta un secreto nuevo. `threadTs` es la misma clave de correlación de A.2 (`tech_agent_handoffs.threadTs`).

Implementado:
- `src/channels/webhook/handle-tech-agent-diagnosis.ts`: `isTechAgentDiagnosisPayload(body)`
  (type guard) + `handleTechAgentDiagnosis(client, payload)` — busca el handoff pendiente por
  `threadTs` (`findPendingHandoffByThreadTs`, ya existía de A.2) y si lo encuentra, delega en
  A.4. Si no hay handoff (ya resuelto, expiró, o `threadTs` desconocido), solo loguea un warning
  y no hace nada.
- `src/channels/webhook/server.ts`: ahora recibe un `client: WebClient` por parámetro y
  despacha por `body.type` — si es `"tech_agent_diagnosis"` llama al handler anterior de forma
  **fire-and-forget** (`.catch()` con warning, mismo patrón que `saveWebhookEvent`); cualquier
  otro payload sigue cayendo al log+guardado genérico de siempre, sin romper nada de lo
  existente (incluido lo que use Pendiente #13 de `ESTADO-PROYECTO.md` en el futuro).
- `src/channels/slack/bot.ts`: pasa `app.client` (el `WebClient` ya autenticado de Bolt) a
  `startWebhookServer(app.client)` — no crea una instancia nueva, reusa la existente.

**No implementado, ya no aplica**: `tech-agent-response-handler.ts` (el listener de Slack de la
versión original de esta sección) — descartado por el cambio de diseño arriba. El repo
`Agente-Tecnico` (todavía no existe) deberá implementar el lado que llama a este webhook.

### A.4 — Extracción confiable + respuesta diferida al cliente — **IMPLEMENTADO 2026-08-13**

`src/agent/extract-tech-diagnosis.ts`, mismo patrón `withStructuredOutput` que
`extract-ticket-fields.ts` (modelo secundario, `MODEL` fijo de `agent/model.ts`):

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

Separar `causaRaiz`/`componenteAfectado` (uso interno, se guardan en el handoff) de
`resumenParaCliente` es deliberado: la jerga interna de n8n no debe llegarle a Spectrum.

`src/agent/deliver-tech-diagnosis.ts` (nombre final; la versión original de este plan lo llamaba
`agent/tech-agent-handoff.ts`, renombrado para no chocar con `integrations/mongo/tech-agent-handoff.ts`)
— entrega diferida, reusando el patrón de "postear fuera del ciclo del evento entrante" que ya
usa `handleResolvedMessage`/`debounce-queue.ts`:

```ts
export async function deliverTechDiagnosis(client: WebClient, handoff: TechAgentHandoffDoc, mensajeAgenteTecnico: string): Promise<void> {
  const diagnosis = await extractTechDiagnosis(mensajeAgenteTecnico);
  await markHandoffAnswered(handoff.threadTs, mensajeAgenteTecnico, diagnosis.causaRaiz, diagnosis.componenteAfectado);

  const mensajeFinal = diagnosis.resuelto
    ? `Nuestro equipo técnico revisó tu caso: ${diagnosis.resumenParaCliente}`
    : `Nuestro equipo técnico está investigando tu caso. Por ahora: ${diagnosis.resumenParaCliente}`;

  await client.chat.postMessage({ channel: handoff.originalChannelId, text: toSlackMrkdwn(mensajeFinal) });
  await appendMessage(handoff.originalSlackUserId, "ai", mensajeFinal).catch(...); // best-effort, no pierde la entrega si falla
}
```

No se reinvoca `askDaniel()` completo — sería un tool-loop innecesario sobre una respuesta ya
determinística, consistente con la filosofía del proyecto de preferir lo determinístico sobre
confiar en que el LLM "decida bien" (ver comentarios de `daniel.ts` y `ticket-fields.ts` sobre
bugs reales de eso).

**Gap conocido, aceptado por ahora**: si `extractTechDiagnosis` falla (error de red/LLM), el
handoff queda `"pending"` para siempre y el cliente nunca recibe respuesta — no hay reintento.
Mismo gap que ya existía sin timeout (A.5, todavía sin construir); no se resuelve acá a
propósito, mismo criterio de alcance que el resto de A.1-A.4.

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

## B. Lado Agente Técnico (repo nuevo `Agente-Tecnico`) — **SUPERSEDIDO 2026-08-13, ver sección E**

> **Esta sección B completa (repo nuevo `Agente-Tecnico` construido desde cero en Node/TS/LangChain.js,
> con `@langchain/mcp-adapters` para n8n-mcp) queda SUPERSEDIDA.** Decisión (2026-08-13, mismo
> día): el Agente Técnico va a ser una instancia configurada de **Hermes Agent**
> (`github.com/NousResearch/hermes-agent`, MIT, de Nous Research) en vez de un repo propio
> escrito a mano — "ya está creado, es solo configurarlo". Ver sección E para el diseño vigente.
> Se conserva el contenido original de B como referencia (la lista de tools de solo lectura de
> n8n-mcp sigue siendo válida conceptualmente, por ejemplo), pero **nada de esta sección se va a
> construir tal cual está escrito**.

### Decisiones de arranque (2026-08-13, sesión de "cómo construimos el lado B") — ver nota de arriba, contexto histórico

- **Ya hay acceso real hoy al n8n de Spectrum (`N8N_API_URL`/`N8N_API_KEY`) y a su MongoDB** —
  RedTec ya opera esa infraestructura. Esto descarta la necesidad de un n8n local descartable
  (sección D.1) como paso previo: se construye y prueba B.2 directo contra lo real desde el
  principio. La sección D.1 queda como alternativa solo si en algún momento se pierde el acceso
  real temporalmente.
- **Alcance nuevo, no estaba en la versión original de este plan**: además de n8n-mcp, el
  Agente Técnico necesita **tools de solo lectura sobre la MongoDB de Spectrum** — conversaciones,
  leads, appointments ("y otros más", sin terminar de enumerar) — para poder responder preguntas
  de diagnóstico que n8n solo no contesta (ej. "¿se perdieron leads por este error?"). **Diseño
  concreto (nombres de colección, forma de los documentos, qué tools exactas exponer) queda
  pendiente** hasta tener el esquema real — decidido explícitamente NO resolverlo revisando
  `Agent-Spectrum/` todavía ni pidiéndoselo a Jorge ahora, para no bloquear el resto. Cuando se
  retome: mismo criterio de solo lectura que n8n-mcp (nada de escritura sobre datos de negocio
  de Spectrum desde el MVP).
- **Repo nuevo**: carpeta hermana local (`Garoo/Agente-Tecnico/`) + repo nuevo en GitHub, mismo
  patrón que `Daniel-Agent` (para poder deployar en Coolify después).
- **App de Slack propia del Agente Técnico**: todavía no existe. No bloquea el scaffold (B.1),
  la conexión a n8n-mcp (B.2) ni el prompt (B.3) — hace falta crearla a mano (admin de Slack)
  antes de poder probar B.4/B.5 (escuchar/responder) en vivo.

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

## Discusión de diseño (2026-08-13): mecanismo de comunicación Daniel↔Agente Técnico — **RESUELTO**

**Resolución de Jorge (2026-08-13, mismo día): el canal compartido es solo para observación
humana en esta fase, no para intervención.** Implementado en A.3/A.4 arriba: Slack queda como
narración visible, el webhook `POST /webhook/internal` (ya existente) es la señal real de
correlación con `{"type": "tech_agent_diagnosis", "threadTs", "mensaje"}`. Esto resuelve los
puntos 1 y 2 de la discusión original (ya no hay ambigüedad de "qué mensaje de bot es el
definitivo", y ya no hace falta decidir qué hacer si un humano responde en el hilo — un humano
respondiendo ahí simplemente no dispara nada, es solo charla visible). El punto 3 (reusar el
webhook existente) es exactamente lo que se hizo. Queda el detalle de la sección "Supuestos a
confirmar" de que un humano podría mencionar a `@Daniel` por curiosidad en ese canal — sigue sin
resolver, no bloquea nada.

<details>
<summary>Discusión original (previa a la resolución, se conserva como contexto)</summary>

Antes de tocar código se discutió el mecanismo de correlación de A.3/A.4 (Slack-canal-compartido
como bus, correlación por `thread_ts`, cualquier mensaje de bot en el hilo = respuesta final) y
aparecieron tres puntos débiles concretos, **todavía sin resolver, no reabren las decisiones ya
tomadas de la sección "Decisiones ya tomadas"**:

1. **"Cualquier mensaje de bot en el hilo = diagnóstico final" es frágil.** Si el agente técnico
   narra su proceso ("dejame revisar...", después "encontré esto...") — comportamiento esperado
   si se quiere transparencia en el canal — el handler de Daniel tomaría el primer mensaje como
   definitivo. Falta una señal explícita de "esto es el diagnóstico final" (formato/campo
   distinguible), no "el primer mensaje que aparece".
2. **El filtro `bot_id` en A.3 corta la razón por la que se eligió Slack como transporte.** El
   plan justifica el canal compartido como semilla para humanos-en-el-loop a futuro, pero A.3
   descarta cualquier mensaje sin `bot_id` — si un humano responde en el hilo hoy, Daniel lo
   ignora y el cliente no recibe nada (sin disparar el timeout tampoco). Si el canal es solo para
   que humanos *observen* (no intervengan) en esta fase, el beneficio real de Slack-como-bus vs.
   HTTP es más chico de lo que suena.
3. **Ya existe infraestructura que este plan no reutiliza**: el webhook genérico
   (`POST /webhook/internal`, `src/channels/webhook/server.ts`) se construyó pensando en "otros
   agentes de RedTec" (ver Pendiente #13 de `ESTADO-PROYECTO.md`). El Agente Técnico podría
   llamar a un endpoint HTTP de Daniel cuando termina el diagnóstico (señal de "terminé"
   explícita e inequívoca, con `threadTs`/`handoffId`), dejando el canal de Slack como pura
   narración visible para humanos — no como el mecanismo de correlación máquina-a-máquina.

**Pregunta que estaba abierta acá: ya resuelta arriba (2026-08-13)** — canal solo observación,
webhook como señal real. Ver A.3/A.4 para la implementación.

</details>

## E. Segundo rediseño (2026-08-13, misma sesión): tecnología Hermes Agent + comunicación 100% por Slack + un canal por cliente — **DISEÑO VIGENTE, sin implementar todavía**

Sesión de "decidamos cómo construimos el Agente Técnico" — reemplaza la sección B y la parte de
correlación de A.3/A.4 de arriba. **Nada de esto está implementado en código todavía** — a
propósito, Jorge pidió dejarlo solo documentado en esta sesión.

### E.1 — Tecnología: Hermes Agent, no un repo bespoke

El Agente Técnico va a ser una instancia configurada de
**[Hermes Agent](https://github.com/NousResearch/hermes-agent)** (Nous Research, MIT license,
open source, activo) en vez de escribir un repo Node/TS/LangChain.js desde cero (la sección B
original). Investigación hecha sobre la doc oficial (`hermes-agent.nousresearch.com`, no
confundir con sitios de contenido tipo `hermes-agent.ai`/`.org`/`hermes-ai.net` que aparecen en
buscadores con el mismo nombre pero no son el proyecto real):

- **Modelo/proveedor**: soporta OpenRouter (además de Nous Portal, OpenAI, o cualquier endpoint
  compatible) — mismo proveedor que ya usa Daniel.
- **MCP**: soporta conectarse a "cualquier servidor MCP" (`n8n-mcp` incluido) y permite
  restringir exactamente qué tools de ese servidor se habilitan vía `tools: include: [...]` en
  la config de cada servidor MCP — esto es lo que garantiza el requisito de **solo lectura**
  sobre n8n (decisión ya tomada, no reabrir): se incluirían únicamente `search_nodes`, `get_node`,
  `n8n_get_workflow`, `list_executions`, `get_execution`, `execution_explain` (la misma lista de
  B.2 original), nunca las tools de escritura de n8n-mcp.
- **Seguridad**: modelo de "defensa en profundidad" en 8 capas (aislamiento por contenedor
  Docker/Singularity/Modal con `--cap-drop ALL`, filtrado de credenciales hacia subprocesos MCP,
  aprobación humana para comandos peligrosos, sandbox de `execute_code` que bloquea env vars con
  nombres tipo `KEY`/`TOKEN`/`SECRET`, escaneo de prompt injection en archivos de contexto,
  aislamiento entre sesiones). Más robusto de lo esperado para un proyecto de este tipo.
- **Gap encontrado, sin verificar todavía**: la documentación **no menciona restricción de
  tools por canal de Slack** — la autorización es a nivel de usuario (allowlists), no de canal.
  Como cada instancia va a vivir en un canal privado dedicado (ver E.3), esto probablemente no
  importa en la práctica (nadie más tiene acceso al canal), pero **queda pendiente confirmarlo
  en una prueba real**, no asumirlo de la doc.
- **Despliegue**: VPS/Docker/SSH/Daytona/Singularity/Modal — se planea VPS, igual que Daniel.
- **Webhook saliente**: Hermes tiene `hooks.outbound` (eventos de ciclo de vida firmados con
  HMAC hacia una URL), pero el payload es fijo al esquema del evento, no permite campos propios
  como nuestro `threadTs`. Además hay un
  [issue abierto sin resolver](https://github.com/NousResearch/hermes-agent/issues/4386)
  pidiendo exactamente "mandar la respuesta a un chatbot externo" — no está mergeado. **Por esto
  se descarta el webhook como mecanismo de correlación** (ver E.2) y se vuelve a Slack, que es
  la fortaleza nativa de Hermes.

### E.2 — Comunicación Daniel↔Agente Técnico: 100% por Slack, simétrica, con mención explícita como señal de "final"

Reabre y reemplaza la decisión de A.3/A.4 de usar el webhook `/webhook/internal` como señal de
correlación (esa decisión había resuelto la fragilidad de "cualquier mensaje de bot en el hilo
= final", pero forzar a Hermes a llamar un webhook con nuestro payload exacto hoy requiere una
función que Hermes todavía no tiene lista, ver E.1). Nuevo mecanismo, que resuelve la misma
fragilidad de otra forma:

1. Daniel postea en el canal privado (ver E.3) mencionando `<@bot_id del Técnico>` con el
   resumen del problema — esto ya está implementado (A.1, `consult-tech-agent.ts`), sin cambios.
2. El Técnico puede narrar su proceso en el mismo hilo con varios mensajes (visible para
   humanos que estén en el canal) — libre, sin restricción.
3. **Señal de "esta es la respuesta final"**: el Técnico menciona explícitamente `<@bot_id de
   Daniel>` en su mensaje final, en el mismo hilo. Un handler nuevo en Daniel (reemplaza el
   `handle-tech-agent-diagnosis.ts` basado en webhook) escucha mensajes en el canal privado del
   par cliente↔técnico, filtra por `thread_ts` (correlación con `tech_agent_handoffs`, igual que
   antes) **y exige que el mensaje mencione el `bot_id` de Daniel** — así se ignoran los mensajes
   de narración (no mencionan a Daniel) y solo se procesa el mensaje dirigido explícitamente a
   él. Mismo principio simétrico que ya usa Daniel para saber cuándo responder en un canal
   (requiere mención), aplicado en la dirección inversa.
4. A partir de ahí, A.4 sigue igual conceptualmente (extracción con `extractTechDiagnosis`,
   entrega con `deliverTechDiagnosis`) — solo cambia qué dispara la llamada (un mensaje de Slack
   con mención, no un POST al webhook).

**Pendiente de implementar** (no tocar código todavía, según lo pedido): reemplazar
`src/channels/webhook/handle-tech-agent-diagnosis.ts` (y su despacho en `server.ts`) por un
handler de tipo `app.message` en `src/channels/slack/`, similar al `tech-agent-response-handler.ts`
de la versión *original* de A.3 (antes del primer rediseño), pero con el filtro de mención
agregado. El webhook `/webhook/internal` queda sin uso para este propósito (sigue existiendo
para lo demás, ver Pendiente #13 de `ESTADO-PROYECTO.md`).

### E.3 — Un canal de Slack privado por cliente, no un canal único compartido

Cambio respecto a `SLACK_AGENTS_CHANNEL` (un solo canal `agentes-ia` para todo): **cada cliente
tiene su propio canal privado, exclusivo para Daniel + su Agente Técnico** (ej. un canal para
Spectrum, otro para Grupo Paz cuando se sume, otro para Belize, etc.) — pensado para que RedTec
pueda monitorear cada relación cliente↔técnico por separado, no todo mezclado en un solo feed.

Esto reemplaza los env vars únicos `SLACK_AGENTS_CHANNEL`/`SLACK_TECH_AGENT_USER_ID`/
`TECH_AGENT_CLIENTE_SOPORTADO` (pensados para un solo cliente) por una **tabla de ruteo por
cliente**:

```ts
type TechAgentConfig = {
  empresa: string;          // debe matchear profile.empresa, case-insensitive (mismo criterio que hoy)
  slackChannel: string;     // canal privado dedicado a este par cliente↔técnico
  slackBotUserId: string;   // bot_id de la instancia de Hermes Agent de este cliente
};

const TECH_AGENTS: TechAgentConfig[] = [
  { empresa: "Spectrum", slackChannel: "tecnico-spectrum", slackBotUserId: "U..." },
  // { empresa: "Grupo Paz", slackChannel: "tecnico-grupo-paz", slackBotUserId: "U..." },
];
```

El gating por cliente (`daniel.ts`) y la resolución de canal (`consult-tech-agent.ts`) buscan la
fila que corresponde a `profile.empresa` en vez de comparar contra un único valor fijo. Sumar un
segundo cliente es agregar una fila a la tabla, no reescribir la lógica de gating/correlación.
**No implementado todavía** — reemplaza `A.6` (env vars nuevas) tal como está escrito arriba.

### E.4 — Qué queda pendiente de esta sección

- Instalar/configurar una instancia real de Hermes Agent en un VPS (probablemente uno nuevo, no
  el mismo VPS de Daniel, para aislar fallos) — paso manual de Jorge.
- Verificar en la práctica el gap de seguridad de E.1 (scoping por canal).
- Definir dónde vive `TECH_AGENTS` (¿hardcodeado en código, como `customers.json` antes de
  migrar a Mongo? ¿en la colección `customers` de Mongo, agregando los campos `slackChannel`/
  `slackBotUserId` al perfil de la empresa? — sin decidir todavía).
- Diseño de las tools de solo lectura sobre la MongoDB de Spectrum (conversaciones/leads/
  appointments) — sigue pendiente, sin esquema real todavía (ver conversación de esta sesión).
- Reemplazar el código de A.3/A.4 (webhook) por el handler de Slack con mención (E.2) — sin
  tocar todavía, a propósito.

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
