> **Estado: implementado (2026-08-14).** Este documento es el plan de la sesión de código que
> ejecutó la sección E de `plans/2026-08-12-agente-tecnico-n8n-spectrum.md` del lado de este
> repo. Type-check limpio, 60/60 tests verdes al terminar — ver `ESTADO-PROYECTO.md` (punto 12)
> para el resumen final y qué queda pendiente en vivo (cargar el `slackBotUserId` real en
> Coolify, probar el flujo completo end-to-end). Se conserva tal cual se escribió antes de
> codear, como registro de las decisiones de diseño.

# Wiring del lado Daniel para el Agente Técnico (Hermes) — reemplazar correlación por webhook con correlación por Slack

## Contexto

El Agente Técnico (instancia de Hermes Agent) ya está desplegado y funcionando en Slack
(`ESTADO-PROYECTO.md`, sesión 2026-08-14): app "Tecnico Spectrum", canal privado `tecnico-spectrum`,
conectado a n8n vía MCP nativo. Del lado de este repo (Daniel), lo que existe hoy es el diseño
**viejo** (A.1-A.4 de `plans/2026-08-12-agente-tecnico-n8n-spectrum.md`, commits `15f0310`/`70a8ee8`):
la tool `consultar_agente_tecnico` postea en un canal único (`SLACK_AGENTS_CHANNEL`/
`SLACK_TECH_AGENT_USER_ID`, un solo cliente soportado vía `TECH_AGENT_CLIENTE_SOPORTADO`), y la
respuesta se correlaciona vía un **webhook HTTP** (`POST /webhook/internal`,
`body.type === "tech_agent_diagnosis"`) que el Agente Técnico llamaría al terminar.

Ese mecanismo de correlación por webhook quedó **superseded el mismo día** (sección E del plan):
Hermes no tiene todavía una forma limpia de llamar un webhook externo con un payload propio (issue
abierto sin resolver en su repo), así que la correlación pasa a ser **100% por Slack**: el Técnico
menciona explícitamente a `@Daniel` en su mensaje final del hilo como señal inequívoca de
"diagnóstico listo" (en vez de "cualquier mensaje de bot en el hilo = final", que era fáil). Además,
en vez de un canal único compartido por todos los clientes, cada cliente tiene su **propio canal
privado** con su Agente Técnico — ya existe `src/config/tech-agents.ts` con la tabla de ruteo
(`TECH_AGENTS`), pero nada del resto del código la usa todavía.

Esta sesión implementa esa sección E: reemplazar el webhook de correlación por un listener de Slack,
y hacer que la tool y el gating usen la tabla `TECH_AGENTS` en vez de los env vars de un solo cliente.

## Cambios

### 1. Nuevo: dedupe compartido (`src/channels/slack/dedupe.ts`)

Extraer la lógica de `alreadyProcessed`/`processedEvents` que hoy vive privada en
`message-handler.ts` (líneas 9-21) a un helper genérico `wasAlreadyProcessed(eventId, ttlMs?)`,
para que el nuevo handler de respuesta del Técnico la reuse sin duplicar la ventana de dedupe de
60s (Slack puede reenviar el mismo evento si no se acusa recibo a tiempo — ya es un bug real
conocido en este repo, ver `ESTADO-PROYECTO.md`). `message-handler.ts` pasa a importarla.

### 2. Nuevo handler: `src/channels/slack/tech-agent-response-handler.ts`

Reemplaza el mecanismo de correlación de A.3 (webhook). Se registra como un `app.message` más,
igual patrón que `registerMessageHandler`:

```ts
export function registerTechAgentResponseHandler(app: App, danielBotUserId: string): void {
  const mentionTag = `<@${danielBotUserId}>`;

  app.message(async ({ message, client }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;
    if (!("thread_ts" in message) || !message.thread_ts) return; // solo respuestas en hilo
    if (!message.text.includes(mentionTag)) return; // señal explícita de "diagnóstico final"

    const eventId = "client_msg_id" in message ? message.client_msg_id : undefined;
    if (eventId && wasAlreadyProcessed(eventId)) return;

    const handoff = await findPendingHandoffByThreadTs(message.thread_ts);
    if (!handoff) return; // no es una respuesta a un handoff nuestro, o ya se resolvió/expiró

    await deliverTechDiagnosis(client, handoff, message.text);
  });
}
```

Notas de diseño:
- **No filtra por canal**: `findPendingHandoffByThreadTs` ya acota la correlación de forma
  inequívoca (el `threadTs` es único por handoff en Mongo) — no hace falta resolver el nombre de
  canal a ID para este filtro, evita duplicar esa lógica.
- Ignora sus propios errores por handoff individual con try/catch + log, para que un fallo en un
  hilo no tumbe el listener (mismo criterio defensivo que el resto de los handlers de Slack acá).
- No hace falta filtrar mensajes del propio Daniel (nunca se auto-menciona).

### 3. `src/agent/tools/consult-tech-agent.ts`: recibir `TechAgentConfig` en vez de leer env vars

Cambiar la factory a `createConsultTechAgentTool(client, slackUserId, originalChannelId, config: TechAgentConfig)`.
Dentro, usar `config.slackChannel`/`config.slackBotUserId` en vez de `env.slackAgentsChannel`/
`env.slackTechAgentUserId`. `resolveChannelId(client, config.slackChannel)` se mantiene igual
(sigue resolviendo nombre→ID, solo cambia de dónde sale el nombre). Actualizar
`consult-tech-agent.test.ts` para pasar un `TechAgentConfig` fake en vez de mockear `env`.

### 4. `src/agent/tools/index.ts` y `src/agent/daniel.ts`: gating por `TechAgentConfig`, no boolean

- `daniel.ts`: reemplazar el bloque de `techAgentEnabled` (booleano derivado de
  `env.techAgentClienteSoportado`) por `findTechAgentConfig(profile?.empresa)` — si hay match,
  ese es el config a usar. Si `profile?.empresa` no existe todavía (cliente nuevo, mismo criterio
  de "no bloquear el primer contacto" de la decisión #3 original), y hay **exactamente un** config
  en `TECH_AGENTS`, usar ese por default (documentado como limitación: con más de un cliente
  configurado, un perfil desconocido no puede resolver ambigüedad y la tool no se ofrece hasta
  que se conozca la empresa — aceptable para el alcance actual de un solo cliente).
- `tools/index.ts`: cambiar el parámetro `techAgentEnabled: boolean` por
  `techAgentConfig: TechAgentConfig | undefined`; incluir la tool solo si `techAgentConfig && client`.

### 5. Eliminar el camino viejo (webhook)

- Borrar `src/channels/webhook/handle-tech-agent-diagnosis.ts` y su test.
- `src/channels/webhook/server.ts`: quitar el despacho por `body.type === "tech_agent_diagnosis"`
  y el parámetro `client: WebClient` de `startWebhookServer` (ya no lo necesita para nada) —
  vuelve a ser un servidor genérico que solo loguea/persiste crudo.
- `src/channels/slack/bot.ts`: `startWebhookServer(app.client)` → `startWebhookServer()`; agregar
  el registro del nuevo handler junto al existente: `registerTechAgentResponseHandler(app, auth.user_id)`.

### 6. Limpieza de env vars obsoletas

- `src/config/env.ts`: quitar `slackAgentsChannel`, `slackTechAgentUserId`,
  `techAgentClienteSoportado` (reemplazados por la tabla `TECH_AGENTS`, que ya lee sus propias
  env vars por cliente — `TECH_AGENT_SPECTRUM_CHANNEL`/`TECH_AGENT_SPECTRUM_BOT_USER_ID` —
  directo en `config/tech-agents.ts`, sin pasar por `env.ts`).
- `.env.example`: actualizar la sección "Agente Técnico" para reflejar las nuevas env vars por
  cliente y quitar la mención al payload de webhook (ya no aplica).

### 7. Tests

- `consult-tech-agent.test.ts`: actualizar para pasar un `TechAgentConfig` fake.
- `tech-agent-response-handler.test.ts` (nuevo): mismo estilo que `consult-tech-agent.test.ts`
  (mocks de `findPendingHandoffByThreadTs`/`deliverTechDiagnosis`) — casos: mensaje con mención +
  handoff pendiente → entrega; sin mención → ignora; sin `thread_ts` → ignora; sin handoff
  encontrado → ignora; evento duplicado (mismo `client_msg_id`) → solo procesa una vez.
- Borrar `handle-tech-agent-diagnosis.test.ts` (junto con el archivo que testea).
- Correr `npx tsc --noEmit` y `npm test` al final — deben quedar limpios/verdes.

## Fuera de alcance (a propósito, ya documentado como pendiente)

- Restringir `tools.include` del MCP de n8n en Hermes a solo lectura (diferido por pedido de
  Jorge, es config del lado de Hermes, no de este repo).
- A.5 (timeout si el Técnico nunca responde) — sigue sin construir, mismo gap ya aceptado.
- Confirmar en vivo si el `registerMessageHandler` normal de Daniel también dispara con mensajes
  del canal `tecnico-spectrum` que mencionen a Daniel (supuesto sin resolver, no bloqueante).
- Dónde vive `TECH_AGENTS` a largo plazo (¿Mongo, campo en `customers`?) — se queda en código por
  ahora, igual que hoy.

## Verificación

1. `npx tsc --noEmit` limpio.
2. `npm test` — todos verdes (tests actualizados/nuevos incluidos).
3. Revisión manual de que no queda ningún import roto tras borrar
   `handle-tech-agent-diagnosis.ts`/su test (buscar referencias residuales).
4. Prueba en vivo (fuera de esta sesión de código, requiere Slack real): simular un handoff
   pendiente real (Daniel consultando al Técnico desde una conversación de prueba con perfil
   `empresa: "Spectrum"`), y que el Técnico responda mencionando a `@Daniel` en el hilo de
   `tecnico-spectrum` — confirmar que el cliente original recibe el diagnóstico. Esto no se corre
   en esta sesión, queda para Jorge/una sesión de retest en vivo (igual que el resto de las
   features de Slack en este proyecto).
