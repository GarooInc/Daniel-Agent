> **Estado: implementado y commiteado** (rama `feat/redtec-realtime-websocket`, 2026-08-06). Este archivo queda como registro de la discusión/diseño original — el detalle de qué se construyó de verdad y qué falta vive en `ESTADO-PROYECTO.md` (sección "WebSocket de tiempo real de RedTec Realstate" en "Estado actual", y los puntos 6/7 de "Pendientes").

# Integrar el WebSocket de tiempo real de RedTec Realstate en Daniel

## Contexto

RedTec Realstate expone un canal WebSocket único de plataforma (`wss://<dominio>/realtime`, vía `socket.io`, guía adjunta `realtime-websocket-guide.pdf`) que empuja en vivo: eventos de CRM (`lead.created`, `lead.stage_changed`, `appointment.created`, `appointment.cancelled`, cada uno con `tenantId`) y métricas de infra de los 2 contenedores del proyecto (`container.stats` cada 30s, más `get_container_logs` bajo demanda vía ack). Hoy Daniel no tiene ninguna fuente de datos "en vivo" — todo lo que sabe viene de Mongo/JSON estático consultado al vuelo. Esto encaja con el objetivo ya definido de v1 de que Daniel haga "bug triage básico", dándole visibilidad real de si la plataforma está funcionando.

**Decisiones ya tomadas con Jorge para esta primera pasada:**
- **Alcance: solo infra por ahora.** Se conecta el socket y se expone a Daniel una tool de salud agregada (CPU/mem/disco) para responder a clientes tipo "¿está caído el sistema?". Los eventos de CRM (leads/citas) se ingieren y se cachean en Mongo para no perder nada mientras tanto, pero **no se exponen todavía como tool** — el payload solo trae un `tenantId` interno de la plataforma y hoy no existe en el codebase ningún mapeo cliente-de-Slack → tenantId (`customers.json`/`users` no lo tienen). Construir esa tool sin ese mapeo arriesgaría mezclar datos de leads/citas de un tenant en la conversación de otro.
- **Logs crudos de contenedor restringidos.** `get_container_logs` puede devolver stack traces, IPs internas o datos de otros tenants que hayan quedado logueados — no se expone como tool del LLM en conversaciones con clientes externos. Se deja implementado como utilidad interna (no wireada al agente) para uso manual/futuro (ej. un script o un flujo solo-interno), documentado explícitamente en el código el porqué de la restricción.

## Puntos abiertos que Jorge debe confirmar con el equipo de RedTec antes de ir a producción

1. **La guía es inconsistente sobre el nombre de la variable del secreto**: el texto dice que es la misma que ya usa el webhook de superadmin, `SUPPORT_AGENT_WEBHOOK_SECRET`, pero el código de ejemplo usa `process.env.REDTEC_PLATFORM_WS_SECRET`. Ninguna de las dos existe hoy en este repo (no hay ningún webhook implementado todavía). Hay que confirmar con RedTec cuál es la variable/valor real antes del primer deploy con la URL real.
2. No existe todavía una URL real del dominio de la plataforma (la guía usa `<dominio-público-de-la-plataforma>` como placeholder) — falta que RedTec la provea.

Mientras tanto, el código se implementa para que **funcione sin romper nada si estas credenciales no están configuradas** (arranca igual, solo loguea que la conexión realtime está deshabilitada) — así se puede mergear y deployar ya, y activar la conexión real en cuanto RedTec confirme los datos.

## Diseño

**Principio central (ajustado tras feedback de Jorge): nada de consultar el socket "en vivo" en el momento de la pregunta, ni mantener el único estado en memoria.** Todo lo que empuja el socket se persiste en Mongo apenas llega (mismo patrón que ya usa todo el resto del proyecto — Mongo como fuente de verdad, no memoria de proceso) y la tool del agente hace una consulta a Mongo con filtros (horario, etc.), nunca le pide nada al socket ni bloquea esperando un evento nuevo. Esto también evita perder el historial en cada redeploy de Coolify.

Nueva carpeta de integración, siguiendo el patrón ya establecido en `src/integrations/` (una carpeta por servicio externo) y el mismo estilo de conexión singleton lazy que `integrations/mongo/client.ts` y `integrations/redis/client.ts`:

```
src/integrations/redtec-realtime/
  client.ts              # conexión socket.io singleton, auth, reconexión (delegada a socket.io), shutdown
  platform-metrics.ts    # persiste cada container.stats en Mongo + consultas por ventana de tiempo
  container-logs.ts      # requestContainerLogs() — utilidad interna, NO wireada a ninguna tool del agente
  crm-events-cache.ts     # listeners de lead.*/appointment.* → persisten en Mongo (platform_events), sin lectura expuesta todavía
```

- **`client.ts`**: `connectRealtime()` (llamada una vez al boot, idempotente) crea el cliente `socket.io-client` con `path: "/realtime"` y `auth: { secret: env.redtecRealtimeSecret }`. Si `env.redtecRealtimeUrl`/`redtecRealtimeSecret` no están seteados, loguea un `info` y no intenta conectar (no bloquea el arranque del bot — mismo espíritu que el resto del proyecto trata fallas de infra no crítica: loguear y seguir). Registra los listeners de `container.stats` (delega a `platform-metrics.ts`) y de los 4 eventos de CRM (delega a `crm-events-cache.ts`). `disconnectRealtime()` para el shutdown. La reconexión ante cortes de red la maneja socket.io solo (confirmado en la guía) — no hace falta lógica propia de retry.
- **`platform-metrics.ts`**: `recordContainerStats(payload)` inserta un documento por cada push (cada 30s) en una colección Mongo nueva `platform_metrics` (`{ receivedAt, containers: [{container, cpuPercent, memUsedMb, memLimitMb}], disk: {usedPercent, usedGb, totalGb} }`), best-effort (si Mongo falla, solo loguea warning, nunca tira la conexión del socket). Índice TTL sobre `receivedAt` (ej. 7 días — 30s de intervalo son ~2880 docs/día, documentos chicos, pero no tiene sentido guardarlo para siempre) creado en el mismo lugar donde `client.ts` de Mongo ya crea los otros índices al arrancar. `getPlatformMetricsSummary({ sinceMinutes? }): Promise<string | null>` — sin `sinceMinutes` devuelve el último dato conocido (CPU/mem por contenedor + disco); con `sinceMinutes` agrega sobre la ventana (máximo/promedio de CPU y memoria, si hubo algún pico) para poder responder preguntas tipo "¿cómo estuvo el sistema en la última hora?". Devuelve `null` si todavía no hay ningún dato (recién arrancado, esperando el primer push).
- **`container-logs.ts`**: `requestContainerLogs(container, lines)` envuelve el `socket.emit(..., ack)` en una Promise; valida el nombre de contenedor contra el allow-list (`redtec-realstate-api`/`redtec-realstate-ux`) del lado cliente también, antes de emitir (defensa en profundidad, aunque el servidor ya lo valida). Esta es la única pieza que sí habla con el socket "en vivo" bajo demanda — a propósito acotada a esto (pedir logs puntuales no genera tráfico constante, según la guía) y, aun así, deliberadamente no expuesta al agente. Comentario explícito en el archivo aclarando por qué esto no es una tool del agente.
- **`crm-events-cache.ts`**: inserta cada evento recibido en una colección Mongo nueva `platform_events` (`{ tenantId, eventType, payload, receivedAt }`), best-effort. Sin función de lectura todavía — se agrega cuando exista un mapeo tenant→cliente y se construya la tool real; evita código especulativo sin consumidor.

### Tool nueva para el agente

`src/agent/tools/platform-health.ts` — tool `estado_de_la_plataforma` (mismo estilo `tool()` + zod que `search-faqs.ts`), con un argumento opcional `sinceMinutes` (número, opcional — "si el cliente pregunta por un momento pasado, ej. 'hace una hora', pasá cuántos minutos atrás cubrir; si pregunta por ahora mismo, omitilo"). Envuelve `getPlatformMetricsSummary()` (que **lee de Mongo, nunca del socket en el momento de la pregunta**); si devuelve `null` responde algo como "Todavía no tengo datos de salud recientes de la plataforma". Se registra en `src/agent/tools/index.ts` junto a las otras 3 (es sin estado, como `searchFaqsTool`/`lookupCustomerTool`, no necesita factory por sesión). Pequeño ajuste en `src/agent/prompt.ts` para que Daniel sepa que puede usar esta tool cuando un cliente pregunte si el sistema está o estuvo caído/lento.

### Wiring de ciclo de vida

En `src/channels/slack/bot.ts`: llamar `connectRealtime()` junto al resto del "calentamiento" al boot (no bloqueante, mismo patrón que el ping de Redis / warmup de Mongo — loguea éxito/error sin abortar el arranque), y `disconnectRealtime()` en el `shutdown()` junto a `closeRedis()`.

### Config

- `package.json`: agregar dependencia `socket.io-client` (la guía es explícita: hace falta el cliente de socket.io, no un WebSocket nativo).
- `src/config/env.ts`: agregar `redtecRealtimeUrl` (`REDTEC_PLATFORM_WS_URL`) y `redtecRealtimeSecret` (`REDTEC_PLATFORM_WS_SECRET`) — **no** agregarlas a `REQUIRED_ENV_VARS` (deben poder faltar sin romper el arranque, ver "Puntos abiertos" arriba).
- `.env.example`: documentar ambas como opcionales, con nota inline sobre la inconsistencia del nombre del secreto a confirmar con RedTec.

## Archivos a tocar

- Nuevos: `src/integrations/redtec-realtime/{client,platform-metrics,container-logs,crm-events-cache}.ts` (+ tests para `platform-metrics.ts` formato/agregación por ventana y `container-logs.ts` allow-list)
- Nuevo: `src/agent/tools/platform-health.ts` (+ test)
- Editar: `src/agent/tools/index.ts` (registrar tool), `src/agent/prompt.ts` (mención breve), `src/channels/slack/bot.ts` (connect/disconnect en boot/shutdown), `src/config/env.ts`, `.env.example`, `package.json`

## Verificación

1. `npx tsc --noEmit` limpio y `npm test` en verde (con los tests nuevos).
2. Arrancar `npm run dev:slack` **sin** `REDTEC_PLATFORM_WS_URL`/`REDTEC_PLATFORM_WS_SECRET` en `.env` — confirmar que el bot arranca igual (log "realtime deshabilitado, faltan credenciales") y que `buscar_faqs`/`escalar_a_monday` siguen andando sin cambios.
3. Cuando RedTec confirme URL y secreto real: cargarlos en Coolify, redeploy, confirmar en logs "Realtime conectado", confirmar por query directa a Mongo que `platform_metrics` recibe un doc nuevo cada ~30s, y pasado ese primer minuto preguntarle a Daniel en Slack "¿está funcionando el sistema?" (debe responder con datos reales, leídos de Mongo) y también algo tipo "¿cómo estuvo en la última hora?" (debe usar `sinceMinutes` y agregar sobre la ventana, no solo repetir el último dato).
4. Confirmar que ningún log ni respuesta al cliente incluye texto crudo de `get_container_logs` (grep rápido por dónde se usa `requestContainerLogs` — debe ser cero referencias fuera de `container-logs.ts` mismo, hasta que se decida un uso interno concreto).
