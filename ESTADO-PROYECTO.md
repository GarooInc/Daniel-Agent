# Estado del proyecto — Daniel Agent

Última actualización: 2026-07-29

Este archivo refleja **qué está construido ahora mismo** y **qué sigue**, para retomar el trabajo desde cualquier máquina sin perder contexto. Para el diseño completo (tareas de v1, decisiones de stack, tablero de Monday, etc.) ver `NOTAS-INICIALES.md`.

## Setup en una máquina nueva

```bash
git clone <repo>
cd Daniel-Agent
npm install
cp .env.example .env
# Llenar .env con las credenciales reales (ver sección "Credenciales" abajo)
npm run dev
```

**El `.env` nunca se sube a git** (está en `.gitignore`). Cada máquina necesita su propio `.env` con las credenciales llenadas a mano — no viajan con el repo.

## Credenciales necesarias (`.env`)

Todas ya generadas y en uso — ver `.env.example` para la plantilla. Si necesitas regenerarlas, los pasos completos (dónde conseguir cada una) están en `NOTAS-INICIALES.md`:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (opcional, default `openai/gpt-5-mini`; alternativa a probar si las respuestas no convencen: `deepseek/deepseek-v4-pro`)
- `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
- `MONDAY_API_TOKEN`

**Estado de esta máquina específica** (la que usó esta sesión de trabajo): tiene un `.env` con `MONDAY_API_TOKEN` real cargado (por eso se pudo probar la escalación a Monday end-to-end acá mismo), pero `OPENROUTER_API_KEY` y las tres variables de Slack están vacías — por eso las pruebas de `askDaniel` y del bot de Slack quedaron pendientes en esta máquina. Si vas a retomar en otra PC, vas a necesitar las 5 credenciales completas ahí para poder probar todo de punta a punta.

## Estructura del proyecto

Arquitectura por capas, pensada para escalar (más tools, más canales) sin volver a un archivo gigante:

```
src/
  index.ts            # entrypoint: chequeo de variables de entorno (npm run dev)
  slack.ts             # entrypoint: arranca el canal de Slack (npm run dev:slack)
  agent-cli.ts          # entrypoint: prueba askDaniel suelto por consola (npm run dev:agent)

  config/
    env.ts               # única fuente de verdad para variables de entorno
    logger.ts             # logger estructurado (pino)

  knowledge-base/         # capa de datos (hoy JSON, mañana la BD real)
    types.ts
    faqs.ts
    customers.ts
    index.ts

  agent/                  # el "cerebro" de Daniel
    prompt.ts               # system prompt
    model.ts                 # cliente ChatOpenAI/OpenRouter
    daniel.ts                 # loop de tool-calling → askDaniel()
    index.ts
    tools/
      search-faqs.ts
      lookup-customer.ts
      escalate-to-monday.ts
      index.ts

  channels/               # un canal por carpeta (Slack hoy, web widget/WhatsApp después)
    slack/
      bot.ts
      message-handler.ts
      index.ts

  integrations/           # servicios externos a los que Daniel llama (no clientes hablándole a él)
    monday/
      client.ts             # helper GraphQL genérico contra api.monday.com/v2
      board.ts                # IDs del board y columnas del tablero de soporte
      create-ticket.ts         # createSupportTicket()
      index.ts

  data/
    faqs.json
    customers.json
```

Regla simple para el futuro: nueva tool → un archivo en `agent/tools/`; nuevo canal (web widget, WhatsApp) → una carpeta nueva en `channels/`; nueva integración externa (CRM, etc.) → una carpeta nueva en `integrations/`; nueva fuente de datos real → reemplazar la implementación en `knowledge-base/` sin tocar el resto.

## Estado actual (construido y verificado)

- [x] Proyecto Node.js + TypeScript inicializado (`package.json`, `tsconfig.json`)
- [x] Dependencias base instaladas: `typescript`, `tsx`, `@types/node`, `dotenv`
- [x] `src/index.ts` + `src/config/env.ts` — chequeo/carga tipada de variables de entorno. Verificado: corre con `npm run dev` y confirma que las 5 variables requeridas están presentes.
- [x] `@slack/bolt` instalado (v5)
- [x] `src/channels/slack/` — bot en Socket Mode (`npm run dev:slack`), conectado a `askDaniel` (ya no es el echo): `bot.ts` arma la app y `message-handler.ts` recibe el mensaje del canal, lo pasa a `askDaniel` y responde con lo que devuelve el agente (FAQs y estado de cuenta vía las tools). Si `askDaniel` tira error, responde con un mensaje de fallback avisando que va a escalar. `bot.ts` también maneja `SIGINT`/`SIGTERM` para cerrar la conexión Socket Mode prolijamente (`app.stop()`) antes de salir. Type-checkea limpio (`npx tsc --noEmit`). **Sin probar en vivo**: falta `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET`/`OPENROUTER_API_KEY` reales en el `.env` de esta máquina — falta correrlo con el bot añadido al workspace de Slack para confirmar la conexión Socket Mode + OpenRouter end-to-end.
- [x] **Logging estructurado**: `src/config/logger.ts`, instancia de `pino` compartida (`pino-pretty` en dev — colores y timestamps legibles; JSON plano en producción vía `NODE_ENV=production`). Reemplaza los `console.log`/`console.error` en `channels/slack/bot.ts`, `channels/slack/message-handler.ts` y `agent/tools/escalate-to-monday.ts` (logea éxito/error al crear el ticket en Monday, para no tener fallos silenciosos ahí). Los entrypoints CLI (`src/index.ts`, `src/agent-cli.ts`) quedaron con `console.log` a propósito — son output directo para un humano corriéndolos una vez, no logs de un proceso corriendo. Probado en runtime con `tsx`, funciona.
- [x] Base de conocimiento ficticia: `src/data/faqs.json` (16 FAQs de ejemplo: Isabella, Sofi, widget-chatbot — uso, configuración, funcionalidades, facturación) y `src/data/customers.json` (7 clientes/cuentas de ejemplo con distintos estados: activo, moroso, en_prueba, cancelado). Loader tipado en `src/knowledge-base/` (`faqs.ts`, `customers.ts`, `types.ts`) con `searchFaqs`, `getFaqsByProducto`, `getCustomerByEmail`, `getAllFaqs`, `getAllCustomers`. Probado en runtime con `tsx`, funciona.
- [x] **Agente LangChain.js + OpenRouter**: `src/agent/` (`prompt.ts`, `model.ts`, `daniel.ts`, `tools/`), función `askDaniel(mensaje)` exportada desde `src/agent/index.ts`. Usa `ChatOpenAI` de `@langchain/openai` apuntando a `baseURL: https://openrouter.ai/api/v1` con `OPENROUTER_API_KEY`. Modelo default `openai/gpt-5-mini` (configurable con `OPENROUTER_MODEL` en `.env`; si las respuestas no convencen, probar `deepseek/deepseek-v4-pro`). Tres tools en `agent/tools/`: `buscar_faqs` (envuelve `searchFaqs`), `buscar_cliente` (envuelve `getCustomerByEmail`) y `escalar_a_monday` (crea el ticket, ver abajo). Loop manual de tool-calling (hasta 5 iteraciones, en `daniel.ts`) en vez de un agente prearmado de LangChain — más simple y suficiente para v1. Type-checkea limpio. Se puede probar suelto con `npx tsx src/agent-cli.ts "pregunta"` (`npm run dev:agent`). **Verificado hasta el límite de las credenciales de esta máquina**: sin `OPENROUTER_API_KEY` real no se pudo confirmar una respuesta completa, pero se probó que el flujo llega correctamente hasta la llamada HTTP a OpenRouter (falla con 401 esperado usando una key dummy) — o sea el wiring de LangChain + tools está bien armado, falta la prueba end-to-end con la key real.
- [x] **Escalación a Monday.com**: `src/integrations/monday/` (`client.ts` — helper GraphQL genérico, `board.ts` — board ID `5101177200` y column IDs, `create-ticket.ts` — `createSupportTicket()`) + tool `escalar_a_monday` en `src/agent/tools/escalate-to-monday.ts`. El system prompt (`agent/prompt.ts`) ya instruye a Daniel a pedir nombre/email si faltan y a llamar a la tool para escalar en vez de solo decir que va a hacerlo. Columnas que se completan, con las etiquetas reales confirmadas contra el board (vía `settings_str` de cada columna, `NOTAS-INICIALES.md` no las tenía documentadas y las que yo había asumido inicialmente estaban mal):
  - email (`text`), resumen (`text1`), qué se intentó (`long_text_mm5per1v`) — texto libre.
  - urgencia (`status6`): `"No es urgente"` / `"Urgente"`.
  - tipo de solicitud (`status4`): `"Problema"` / `"Solicitud"` / `"Pregunta"`.
  - canal de origen (`color_mm5p5k5s`): en minúscula — fijo en `"slack"` por ahora (único canal activo); otras opciones ya configuradas en el board para cuando existan esos canales: `widget`, `whatsapp`, `instagram`, `messenger`, `telegram`, `default`.
  - **producto** (`color_mm5qwh54`): `"Isabella"` / `"Sofi"` / `"Widget-chatbot"` / `"Otro"`. **Columna nueva, creada por mí en el tablero real** (no existía en la plantilla original) vía `create_column` de la API de Monday — le da al equipo de soporte una forma de filtrar/reportar tickets por producto, dato que Daniel ya conoce por el contexto de la conversación. La columna `Categoría` (`status63`: Equipo/VPN/Software/General) se dejó intacta a propósito — es para tickets de soporte interno (fase 2), no aplica a clientes externos.
  - Estado (`status2`) no se setea — Monday lo deja en su default (`"En curso"`) al crear el item.
  - **Probado end-to-end con el token real** (dos veces, ambos tickets de prueba ya borrados del tablero): un ticket inicial (item id `3122651184`) y uno después de sumar la columna Producto (item id `3122700705`) — ambos aceptados por Monday sin errores.

**Nota de red de esta máquina**: el fetch nativo de Node (`undici`) tiene timeouts intermitentes (`ETIMEDOUT`) contra hosts externos (pasó con `registry.npmjs.org`, `api.monday.com` y hasta `openrouter.ai`) que `curl` no sufre — parece un problema de resolución/preferencia IPv6 en esta máquina. Si el bot corriendo en otra máquina tiene llamadas que cuelgan o tardan mucho, probar arrancándolo con `NODE_OPTIONS="--dns-result-order=ipv4first" npm run dev:slack` antes de asumir que es un bug de la app.

**Conector MCP de Monday.com disponible (sin usar todavía)**: apareció un conector `claude.ai monday.com` (requiere autenticar corriendo `/mcp` y eligiéndolo de la lista) que no existía cuando se definió el stack original. La integración ya construida (`src/integrations/monday/`) usa la API GraphQL directa y está probada — el MCP no la reemplazó, pero queda como opción para inspeccionar el tablero interactivamente sin escribir queries a mano.

**Auditoría de buenas prácticas backend** (skill `nodejs-backend-patterns`, instalado globalmente, correr `/nodejs-backend-patterns` para volver a ver la guía): ya resueltos — logging estructurado y graceful shutdown (ver arriba). Todavía sin atacar, quedan en el backlog general (no bloquean nada del loop v1):
- Sin tests (ni un archivo, ni framework instalado) — tiene sentido priorizarlo recién cuando el flujo Slack+agente+Monday esté confirmado funcionando en vivo.
- Sin clases de error custom — todo error es un `Error` genérico o un string devuelto a la tool; funciona pero no distingue tipos de falla.
- Rate limiting / HTTPS / CORS / health checks / compression: no aplican todavía porque no hay ningún servidor HTTP expuesto (Slack Socket Mode no lo necesita) — van a importar cuando se construya el widget web (canal #2 del roadmap).

## Pendientes / próximos pasos (en orden)

1. **Probar `askDaniel` en vivo con `OPENROUTER_API_KEY` real** — correr `npm run dev:agent -- "¿Cómo conecto Isabella con mi calendario?"` en una máquina con `.env` lleno y confirmar que responde usando `buscar_faqs`, y probar también con un email de `customers.json` para `buscar_cliente`.
2. **Probar el flujo completo Slack + agente en vivo** — con `.env` lleno (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENROUTER_API_KEY`), correr `npm run dev:slack`, escribirle al bot en un canal donde esté invitado y confirmar que responde usando la base de conocimiento (no el echo viejo).
3. **Probar la escalación a Monday.com disparada por Daniel en Slack** — pedirle a Daniel por Slack algo que no pueda resolver (ej. un bug inventado) y confirmar que aparece el ticket con los campos bien completados (esto ya probamos que la mutation en sí funciona; falta confirmar que el agente decide llamarla correctamente en una conversación real).
4. **(Backlog, no bloqueante)** Tests básicos para `knowledge-base/`, `agent/` e `integrations/monday/`, y considerar clases de error custom — ver la auditoría arriba.

## Referencia rápida del stack

Node.js + TypeScript · Slack vía `@slack/bolt` (Socket Mode) · Orquestación con LangChain.js · LLM vía OpenRouter · Persistencia v1 en JSON simples · Escalación vía API GraphQL de Monday.com (board `5101177200`) · Logging con `pino`.

**Nota**: Express estaba en el plan original del stack pero **todavía no se instaló ni se usa** — no hizo falta porque todo el tráfico entra por Slack Socket Mode, que no necesita servidor HTTP. Va a hacer falta recién con el widget web (canal #2 del roadmap).

Detalle completo de cada decisión y por qué se tomó: `NOTAS-INICIALES.md`.
