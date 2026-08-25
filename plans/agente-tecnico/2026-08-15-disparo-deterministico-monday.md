> **Estado: implementado (2026-08-15).** Type-check limpio, 64/64 tests verdes al terminar — ver
> `ESTADO-PROYECTO.md` (punto 12) para el resumen final y qué queda pendiente en vivo (probar el
> flujo completo de punta a punta con este código ya deployado). Se conserva tal cual se escribió
> antes de codear, como registro de las decisiones de diseño.

# Disparo determinístico de la consulta al Agente Técnico desde el ticket + Daniel actualiza el ticket real en Monday

## Contexto

En la prueba en vivo del wiring recién deployado, Daniel escaló un problema técnico (sobre el
Data Agent) a un ticket de Monday (`escalar_a_monday`) **sin nunca llamar a
`consultar_agente_tecnico`** — el modelo tuvo que elegir entre dos tools que compiten, y eligió
mal. Esto repite un patrón ya conocido en este proyecto (ver comentarios de `daniel.ts`/
`ticket-fields.ts`): confiarle a un LLM una decisión de negocio crítica falla en producción con
la frecuencia suficiente como para no ser aceptable. La solución, consistente con el resto del
código (`extractTicketFields`, `mergeTicketFields`, `esNombreDeProducto`), es sacar esa decisión
del LLM y hacerla determinística en código.

Decisión de Jorge (esta sesión): la consulta al Agente Técnico deja de ser una tool que el
modelo elige llamar — pasa a ser un **efecto secundario automático de `escalar_a_monday`**, para
cualquier ticket de un cliente con Agente Técnico configurado (`TECH_AGENTS`). El orden de
trabajo de Daniel no cambia (FAQ → intento de resolver directo → escalar si no se puede, ya
está bien y no se toca — confirmado contra `agent/prompt.ts`). Además, cuando el Técnico
responde, Daniel ya no solo le avisa al cliente por Slack (ya construido) — también **actualiza
el ticket real en Monday** (agrega el diagnóstico como comentario/actualización visible para
cualquiera del equipo que solo mire Monday, y si el diagnóstico es concreto y resuelve el caso,
mueve el estado a "Listo").

Fuera de alcance a propósito para esta ronda (documentado como pendiente, no se construye hoy):
timeout si el Técnico nunca responde (A.5), y unificar `ticket_conversations`/
`tech_agent_handoffs` en un solo modelo de "caso" (hoy quedan dos colecciones con propósito
parecido; se resuelve más adelante).

## Investigación ya hecha (no repetir)

- **Columnas reales del board de Monday confirmadas por API** (`SUPPORT_BOARD_ID = 5101177200`):
  la columna de estado es `status2` ("Estado"), con labels reales `"En curso"` (default) /
  `"Listo"` / `"Enviado"` / `"Rechazado"` — no existe un estado tipo "en revisión técnica", así
  que no hay que inventar una transición intermedia: solo mover a `"Listo"` cuando el diagnóstico
  resuelve el caso (`diagnosis.resuelto === true`), dejar `"En curso"` en cualquier otro caso.
- **Mutations de Monday necesarias** (API GraphQL v2, mismo patrón que `create-ticket.ts`):
  - Agregar comentario/actualización a un item: `create_update(item_id: ID!, body: String!)`.
  - Cambiar un status column: `change_simple_column_value(board_id: ID!, item_id: ID!, column_id: String!, value: String!)` (para columnas `status`, `value` es el label en texto plano).
- `ticket_conversations.ts` (`integrations/mongo/ticket-conversations.ts`) ya guarda
  `mondayItemId → slackUserId/channelId` — no hace falta tocarlo, sirve de referencia de patrón
  pero esta ronda no lo unifica con `tech_agent_handoffs`.

## Cambios

### 1. `agent/tools/consult-tech-agent.ts`: deja de ser una `tool()`, pasa a ser función plana

Renombrar la exportación de `createConsultTechAgentTool` a una función async plana
`notifyTechAgent(client, slackUserId, originalChannelId, config, resumenProblema, mondayItemId)`
— misma lógica interna (resolver canal, postear mención, `createHandoff`), sin el wrapper
`tool()`/schema de zod (ya no lo necesita, nadie la invoca por tool-calling). Agrega el
parámetro nuevo `mondayItemId: string` que se guarda en el handoff.

Actualizar `consult-tech-agent.test.ts` para testear la función plana en vez de `tool.invoke()`.

### 2. `integrations/mongo/tech-agent-handoff.ts`: agregar `mondayItemId`

`TechAgentHandoffDoc` suma `mondayItemId: string` (no opcional — con el nuevo diseño, todo
handoff nace desde un ticket real). `createHandoff` no cambia de forma (sigue siendo
`Omit<..., "status"|"createdAt">`, el campo nuevo entra solo al ampliar el tipo).

### 3. `agent/tools/escalate-to-monday.ts`: dispara `notifyTechAgent` tras crear el ticket

`createEscalateToMondayTool` suma dos parámetros: `client: WebClient | undefined` y
`techAgentConfig: TechAgentConfig | undefined`. Justo después de que `createSupportTicket` tiene
éxito, junto a los demás efectos secundarios best-effort (`saveCustomerProfile`,
`clearTicketDraft`, `saveTicketConversation`, `notifyEscalation`), agregar:

```ts
if (client && techAgentConfig) {
  notifyTechAgent(client, slackUserId, channelId, techAgentConfig, `${ticket.resumen}\n\nQué se intentó: ${ticket.queSeIntentoYa}`, ticketId).catch((error) => {
    logger.warn({ err: error, ticketId }, "No se pudo notificar al Agente Técnico sobre el ticket nuevo");
  });
}
```

Best-effort igual que el resto: si falla, el ticket ya quedó creado (fuente de verdad), no debe
hacer fallar la escalación.

Actualizar `escalate-to-monday.test.ts`: nuevos casos (llama a `notifyTechAgent` cuando hay
`client`+`techAgentConfig`; no la llama si falta cualquiera de los dos; el ticket se crea igual
si `notifyTechAgent` rechaza).

### 4. `agent/tools/index.ts` y `agent/daniel.ts`: mover `techAgentConfig`/`client` de "gating de tool" a "parámetro de `escalar_a_monday`"

- `tools/index.ts`: `buildToolsByName` deja de condicionalmente empujar
  `createConsultTechAgentTool` al array de tools — ese import/uso se borra. En cambio, pasa
  `client`/`techAgentConfig` a `createEscalateToMondayTool(...)`.
- `daniel.ts`: el cálculo de `techAgentConfig` (`findTechAgentConfig(profile?.empresa)` con el
  fallback ya existente cuando el perfil es nuevo y hay un solo cliente en `TECH_AGENTS`) se
  mantiene igual — solo cambia a qué función se lo pasa. El modelo ya no necesita bindear una
  tool condicional para esto; `toolsByName` simplifica a un set fijo de tools (FAQs, cliente,
  plataforma, escalar_a_monday) que ya no varía por cliente.

### 5. Nueva integración de Monday: agregar comentario + cambiar estado

Archivo nuevo `integrations/monday/ticket-updates.ts` (mismo patrón que `create-ticket.ts`,
usando `mondayRequest`/`SUPPORT_BOARD_ID`/`SUPPORT_BOARD_COLUMNS` de `board.ts`):

```ts
export async function addTicketUpdate(itemId: string, body: string): Promise<void> { ... }
export async function markTicketReady(itemId: string): Promise<void> { ... } // status2 -> "Listo"
```

`board.ts` suma `estado: "status2"` a `SUPPORT_BOARD_COLUMNS` (y un `ESTADO_VALUES`/tipo si hace
falta, aunque acá alcanza con el literal `"Listo"`, no se expone como enum de ticket porque
Daniel nunca lo setea al crear — solo se usa acá).

### 6. `agent/deliver-tech-diagnosis.ts`: actualiza el ticket real en Monday

Después de armar `mensajeFinal` (sin cambios en esa parte), agregar, en paralelo con el aviso al
cliente y el guardado en el historial (best-effort, mismo criterio que el resto):

```ts
addTicketUpdate(handoff.mondayItemId, `Diagnóstico del equipo técnico:\n\n${mensajeAgenteTecnico}`).catch((err) => {
  logger.warn({ err, mondayItemId: handoff.mondayItemId }, "No se pudo agregar el diagnóstico al ticket de Monday");
});
if (diagnosis.resuelto) {
  markTicketReady(handoff.mondayItemId).catch((err) => {
    logger.warn({ err, mondayItemId: handoff.mondayItemId }, "No se pudo marcar el ticket como Listo en Monday");
  });
}
```

Actualizar `deliver-tech-diagnosis.test.ts`: nuevos casos para `addTicketUpdate` (siempre se
llama) y `markTicketReady` (solo si `resuelto`), más un caso de "Monday falla, no rompe la
entrega al cliente" (mismo espíritu que el test ya existente de "no pierde la entrega si falla
Mongo").

## Verificación

1. `npx tsc --noEmit` limpio.
2. `npm test` — todos verdes (tests actualizados + los nuevos casos).
3. `git grep` rápido para confirmar que no queda ningún import roto de
   `createConsultTechAgentTool` (renombrada) en ningún archivo.
4. Prueba en vivo (fuera de esta sesión de código): repetir la misma pregunta técnica sobre el
   Data Agent que falló hoy — confirmar que el ticket se crea EN Monday, que en `tecnico-spectrum`
   aparece automáticamente el aviso al Técnico (sin que el modelo lo haya "decidido"), que la
   mención de vuelta del Técnico entrega el diagnóstico al cliente, y que el item de Monday
   termina con un comentario nuevo (y, si aplica, estado "Listo").
