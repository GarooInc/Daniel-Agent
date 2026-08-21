# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Daniel es el agente de soporte (Slack) de RedTec, construido en Node.js/TypeScript + LangChain.js sobre OpenRouter. Recibe mensajes de clientes por Slack, responde con FAQs/estado de cuenta usando tools, y escala a Monday.com cuando hace falta un ticket humano. Un segundo agente ("Agente Técnico", Hermes Agent, desplegado aparte) audita n8n de clientes y le devuelve diagnósticos a Daniel por Slack.

Para contexto histórico completo de decisiones, bugs encontrados/arreglados, y pendientes: **`ESTADO-PROYECTO.md`** (fuente de verdad del estado actual, se actualiza cada sesión) y **`NOTAS-INICIALES.md`** (diseño original v1). Los planes de features grandes viven en `plans/*.md`, commiteados al repo para poder retomarlos desde cualquier máquina.

## Comandos

```bash
npm install
cp .env.example .env        # llenar credenciales reales, nunca se commitea

npm run dev            # entrypoint que solo chequea env vars
npm run dev:slack      # arranca el bot de Slack en Socket Mode (uso normal en desarrollo)
npm run dev:agent      # prueba askDaniel() suelto por consola, sin Slack: npm run dev:agent "pregunta"

npx tsc --noEmit       # type-check (lo que corre CI)
npm test               # vitest run (todos los tests)
npx vitest run src/agent/daniel.test.ts   # un solo archivo de test
npx vitest run -t "nombre del test"       # un solo test por nombre

npm run test:e2e       # flujo multi-turno con LLM y Monday reales (sin Mongo, in-memory store), crea y borra un ticket de prueba

npm run build          # tsc -> dist/
npm start              # node dist/slack.js (producción)

npm run migrate:faqs       # sembrar/reembeber FAQs en Mongo
npm run migrate:customers  # migrar customers.json/users a la colección unificada `customers`
```

CI (`.github/workflows/ci.yml`) corre `tsc --noEmit` + `npm test` en cada push/PR a `main`, sin secrets (los tests mockean Mongo/OpenRouter/Monday).

## Arquitectura

Capas pensadas para escalar (más tools, más canales, más integraciones) sin volver a un archivo gigante. Regla para código nuevo: **nueva tool → un archivo en `agent/tools/`; nuevo canal → una carpeta nueva en `channels/`; nueva integración externa → una carpeta nueva en `integrations/`; nueva fuente de datos real → reemplazar la implementación en `knowledge-base/` sin tocar el resto.**

```
src/
  config/        env.ts (única fuente de verdad de env vars), logger.ts (pino), tech-agents.ts (tabla de ruteo cliente->Agente Técnico)
  knowledge-base/  capa de datos de FAQs/customers (hoy vectorizado en Mongo, ver abajo)
  agent/         el "cerebro": prompt.ts, model.ts (modelo fijo en código, no env var), daniel.ts (loop de tool-calling -> askDaniel()), tools/
  channels/      un canal por carpeta: slack/ (Bolt, Socket Mode) y webhook/ (HTTP genérico node:http)
  integrations/  servicios externos que Daniel llama: monday/, mongo/, slack/ (notificaciones), redtec-realtime/ (WebSocket), embeddings/, redis/
  messaging/     debounce-queue.ts (BullMQ, agrupa mensajes rápidos del mismo usuario antes de invocar al agente)
  data/          faqs.json/customers.json — datos de ejemplo, no producción real (ver ESTADO-PROYECTO.md)
```

### `askDaniel()` — el loop principal (`agent/daniel.ts`)

Punto de entrada único de todo el sistema, independiente del canal: `askDaniel(userMessage, slackUserId, channelId, client?)`.

1. Carga en paralelo: historial de chat, perfil de cliente, borrador de ticket — todo por `slackUserId` en Mongo.
2. **Detección de sesión nueva** (gap de +1h sin mensajes de ese usuario): descarta historial y borrador viejos antes de seguir. Esto existe porque un borrador/historial abandonado se filtró a una conversación nueva y disparó un ticket con datos equivocados (bug real, ver ESTADO-PROYECTO.md 2026-07-30).
3. **Extracción determinística de datos del ticket** (`extract-ticket-fields.ts`): una llamada LLM aparte extrae nombre/email/producto/etc. de toda la conversación en cada mensaje, independiente de que el modelo principal decida usar la tool de escalar. Este es el mecanismo central de confiabilidad del proyecto — los modelos probados (`gpt-5-mini`, `deepseek-v4-pro`) no recuperaban de forma confiable datos dados varios turnos atrás por su cuenta. **Si aparece un "Daniel no recuerda algo que ya le dijeron", la solución es sacar ese dato de la memoria del LLM y ponerlo en almacenamiento determinístico como este, no seguir puliendo el prompt.**
4. Resuelve el Agente Técnico del cliente (`findTechAgentConfig` por `profile.empresa`) para pasárselo a la tool de escalar — **no es una tool que el modelo elija llamar**, es un efecto secundario determinístico de `escalar_a_monday` (se sacó del LLM tras un intento fallido en vivo).
5. Loop de tool-calling manual (máx. `MAX_TOOL_ITERATIONS = 5`, no un agente prearmado de LangChain) hasta obtener una respuesta sin `tool_calls`. Si se agotan las iteraciones, lanza `UnresolvedConversationError` — el caller decide qué hacer (hoy: auto-escalar de verdad), **nunca prometerle al cliente algo que no se hizo**.

### Reglas de negocio no obvias

- **Nunca decirle al cliente que se hizo algo si la tool correspondiente no se llamó de verdad** — regla central del prompt (`agent/prompt.ts`), nació de un bug real donde el fallback decía "ya la voy a escalar" sin escalar nada.
- **El modelo LLM es una constante en código** (`agent/model.ts`, `MODEL`), no configurable por env var — decisión explícita de que la elección de modelo sea código, no config de deploy.
- **Slack solo responde si mencionan al bot** en canales (no en DMs) — filtro por `<@BOT_USER_ID>` en `message-handler.ts`.
- **Dedupe de mensajes** por `client_msg_id` (`channels/slack/dedupe.ts`) — Slack puede reenviar el mismo evento si el bot no acusa recibo rápido, y como `askDaniel` puede tardar, se procesaba el mismo mensaje dos veces.
- **Debounce/cola con BullMQ** (`messaging/debounce-queue.ts`) agrupa mensajes rápidos del mismo usuario antes de invocar a `askDaniel` una sola vez. El `jobId`/la clave del buffer incluyen `source_userId_conversationId` (no solo el usuario) — antes solo usaba `slackUserId`, y si el mismo usuario escribía en dos canales dentro de la ventana de debounce la respuesta podía terminar en el canal equivocado (bug real en vivo, arreglado 2026-08-21, ver ESTADO-PROYECTO.md punto 16).
- **`platform-health.ts` nunca lee el WebSocket en vivo** — siempre lee `platform_metrics` (Mongo), poblada por `redtec-realtime/client.ts`, que es no-bloqueante si faltan credenciales (el resto del bot sigue funcionando igual).
- **Webhook HTTP genérico** (`channels/webhook/server.ts`, `node:http` nativo, no Express) recibe datos crudos de sistemas internos sin schema asumido — loguea y persiste todo en `webhook_raw_events` (TTL 30 días) hasta que el schema real se conoce. Convención para nuevas fuentes externas: colección `<fuente>_raw` con TTL default de 30 días, y recién crear una colección tipada derivada cuando el schema se conoce.
- **Agente Técnico** (Hermes Agent, desplegado aparte, fuera de este repo): correlación 100% por Slack — el Técnico debe **mencionar explícitamente a `@Daniel`** en su mensaje de respuesta final para que `tech-agent-response-handler.ts` lo tome como diagnóstico (evita el problema de "cualquier mensaje de bot en el hilo = final"). Ruteo cliente→canal/bot del Técnico vive en `config/tech-agents.ts` (tabla `TECH_AGENTS`, hoy hardcodeada — agregar un cliente nuevo requiere deploy de código).

### Nota de red (solo relevante en la máquina de desarrollo de Windows)

El fetch nativo de Node (`undici`) sufre timeouts intermitentes contra hosts externos en esta máquina — parece un problema de preferencia IPv6. Si algo cuelga sin razón aparente, probar `NODE_OPTIONS="--dns-result-order=ipv4first" npm run dev:slack` antes de asumir un bug de la app.
