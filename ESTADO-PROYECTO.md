# Estado del proyecto — Daniel Agent

Última actualización: 2026-07-30 (noche)

Este archivo refleja **qué está construido ahora mismo** y **qué sigue**, para retomar el trabajo desde cualquier máquina sin perder contexto. Para el diseño completo (tareas de v1, decisiones de stack, tablero de Monday, etc.) ver `NOTAS-INICIALES.md`.

## Setup en una máquina nueva

```bash
git clone https://github.com/GarooInc/Daniel-Agent.git
cd Daniel-Agent
npm install
cp .env.example .env
# Llenar .env con las credenciales reales (ver sección "Credenciales" abajo)
npm run dev
```

**Repo movido a la organización (2026-07-29)**: el repo ahora vive en `GarooInc/Daniel-Agent` (antes en la cuenta personal de Jorge). Si tenías un clone viejo, actualizá el remote: `git remote set-url origin https://github.com/GarooInc/Daniel-Agent.git`.

**El `.env` nunca se sube a git** (está en `.gitignore`). Cada máquina necesita su propio `.env` con las credenciales llenadas a mano — no viajan con el repo.

## Credenciales necesarias (`.env`)

Todas ya generadas y en uso — ver `.env.example` para la plantilla. Si necesitas regenerarlas, los pasos completos (dónde conseguir cada una) están en `NOTAS-INICIALES.md`:

- `OPENROUTER_API_KEY`
- `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
- `SLACK_ESCALATION_CHANNEL` (opcional, default `escalacion` — nombre del canal donde Daniel avisa cada ticket creado)
- `MONDAY_API_TOKEN`
- `MONGODB_URI` (nuevo 2026-07-30, requerido para la memoria de conversación — MongoDB Atlas, cluster `Cluster0` — ver sección de memoria abajo) y `MONGODB_DB_NAME` (default `daniel`; en producción se usa `DanielSoporte`, el nombre real de la BD creada en Atlas)

**Estado de esta máquina específica** (checkout de Windows usado en la sesión del 2026-07-30): tiene `OPENROUTER_API_KEY` y `MONDAY_API_TOKEN` reales cargados en `.env` para poder probar `askDaniel` suelto por consola (`npm run dev:agent`). **`MONGODB_URI` (`mongodb+srv://...`) no resuelve directo desde esta máquina**: la consulta DNS del registro SRV (`_mongodb._tcp....`) da `ETIMEOUT` incluso probando con resolvers alternativos (`8.8.8.8`/`1.1.1.1`) — la red de esta máquina bloquea las consultas DNS SRV por UDP normal, no es un problema del resolver configurado. **Workaround que sí funciona**: resolver el SRV y el TXT (opciones de conexión) manualmente vía DNS-over-HTTPS (`https://cloudflare-dns.com/dns-query?name=...&type=SRV`, funciona porque va sobre HTTPS/443 en vez de UDP/53) y armar a mano un connection string estándar no-SRV (`mongodb://user:pass@host1:27017,host2:27017,host3:27017/?ssl=true&replicaSet=...&authSource=admin`) con esos datos — probado y funciona (usado el 2026-07-30 noche para confirmar el estado real de `chat_histories`/`ticket_drafts`, ver Pendientes). El MCP de MongoDB Atlas conectado a esta sesión de Claude Code sufre el mismo bloqueo y no sirve como atajo.

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
    model.ts                 # cliente ChatOpenAI/OpenRouter (modelo fijo en código, ver abajo)
    daniel.ts                 # loop de tool-calling → askDaniel()
    extract-ticket-fields.ts   # extracción automática de datos del ticket en cada mensaje
    auto-escalate.ts            # escalación real cuando askDaniel falla o se agota
    index.ts
    tools/
      search-faqs.ts
      lookup-customer.ts
      escalate-to-monday.ts
      ticket-fields.ts          # campos requeridos, merge compartido, labels
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
      create-ticket.ts         # createSupportTicket(), enums de urgencia/tipo/producto
      index.ts
    mongo/
      client.ts               # conexión lazy a MongoDB Atlas
      conversation-memory.ts    # chat_histories: historial por usuario de Slack
      customer-profile.ts        # users: nombre/email persistente por usuario
      ticket-draft.ts              # ticket_drafts: borrador de ticket en construcción
    slack/
      notify-escalation.ts     # avisa cada ticket creado en el canal #escalacion

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
- [x] `src/channels/slack/` — bot en Socket Mode (`npm run dev:slack`), conectado a `askDaniel` (ya no es el echo): `bot.ts` arma la app y `message-handler.ts` recibe el mensaje del canal, lo pasa a `askDaniel` y responde con lo que devuelve el agente (FAQs y estado de cuenta vía las tools). Si `askDaniel` tira error, responde con un mensaje de fallback avisando que va a escalar. `bot.ts` también maneja `SIGINT`/`SIGTERM` para cerrar la conexión Socket Mode prolijamente (`app.stop()`) antes de salir. Type-checkea limpio (`npx tsc --noEmit`). **Probado en vivo (2026-07-29)**: conectado en Socket Mode a un canal real de Slack, responde con FAQs y estado de cuenta reales (no el echo viejo).
  - **Requisitos de config de Slack para que el bot reciba mensajes en canales** (no obvios, no estaban documentados): el bot tiene que estar invitado al canal (`/invite @Daniel-Soporte`), y la app necesita en **Event Subscriptions → Subscribe to bot events** el evento `message.channels` (o `message.groups`/`message.im`/`message.mpim` según el tipo de canal) + el scope `channels:history` (o el equivalente) en **OAuth & Permissions**. Sin esto, Slack no entrega ningún evento al socket aunque el bot esté "conectado".
  - **Solo responde si lo mencionan (2026-07-30)**: originalmente Daniel respondía a cualquier mensaje del canal. Ahora `bot.ts` obtiene el `user_id` propio del bot vía `auth.test()` al arrancar y se lo pasa a `registerMessageHandler`, que filtra por `<@USER_ID>` en el texto (y lo quita antes de mandarlo a `askDaniel`). **Probado en vivo en producción (2026-07-30)**: ignora mensajes sin mención, responde solo a `@Daniel-Soporte`.
  - **Bug encontrado y arreglado — duplicación de tickets**: Slack a veces reenvía el mismo evento de mensaje si el bot no lo reconoce como recibido con la suficiente rapidez, y como `askDaniel` (LLM + tool de Monday) puede tardar más de eso, se procesó el mismo mensaje dos veces y se crearon dos tickets duplicados en Monday con la misma info parafraseada distinto. Fix: `message-handler.ts` ahora dedupea por `client_msg_id` con una ventana de 60s antes de llamar a `askDaniel`. Reprobado en vivo: un solo ticket por mensaje.
- [x] **Logging estructurado**: `src/config/logger.ts`, instancia de `pino` compartida (`pino-pretty` en dev — colores y timestamps legibles; JSON plano en producción vía `NODE_ENV=production`). Reemplaza los `console.log`/`console.error` en `channels/slack/bot.ts`, `channels/slack/message-handler.ts` y `agent/tools/escalate-to-monday.ts` (logea éxito/error al crear el ticket en Monday, para no tener fallos silenciosos ahí). Los entrypoints CLI (`src/index.ts`, `src/agent-cli.ts`) quedaron con `console.log` a propósito — son output directo para un humano corriéndolos una vez, no logs de un proceso corriendo. Probado en runtime con `tsx`, funciona.
- [x] Base de conocimiento ficticia: `src/data/faqs.json` (16 FAQs de ejemplo: Isabella, Sofi, widget-chatbot — uso, configuración, funcionalidades, facturación) y `src/data/customers.json` (7 clientes/cuentas de ejemplo con distintos estados: activo, moroso, en_prueba, cancelado). Loader tipado en `src/knowledge-base/` (`faqs.ts`, `customers.ts`, `types.ts`) con `searchFaqs`, `getFaqsByProducto`, `getCustomerByEmail`, `getAllFaqs`, `getAllCustomers`. Probado en runtime con `tsx`, funciona.
- [x] **Agente LangChain.js + OpenRouter**: `src/agent/` (`prompt.ts`, `model.ts`, `daniel.ts`, `tools/`), función `askDaniel(mensaje)` exportada desde `src/agent/index.ts`. Usa `ChatOpenAI` de `@langchain/openai` apuntando a `baseURL: https://openrouter.ai/api/v1` con `OPENROUTER_API_KEY`. Modelo fijo en código (`agent/model.ts`, constante `MODEL`), no en variable de entorno: `deepseek/deepseek-v4-pro` desde el 2026-07-30, después de que `gpt-5-mini` no siguiera de forma confiable el tool-calling en pruebas en vivo (ver detalle más abajo). Si hace falta volver a probar otro modelo, cambiar esa constante. Tres tools en `agent/tools/`: `buscar_faqs` (envuelve `searchFaqs`), `buscar_cliente` (envuelve `getCustomerByEmail`) y `escalar_a_monday` (crea el ticket, ver abajo). Loop manual de tool-calling (hasta 5 iteraciones, en `daniel.ts`) en vez de un agente prearmado de LangChain — más simple y suficiente para v1. Type-checkea limpio. Se puede probar suelto con `npx tsx src/agent-cli.ts "pregunta"` (`npm run dev:agent`). **Probado en vivo con `OPENROUTER_API_KEY` real (2026-07-29)**: `buscar_faqs` y `buscar_cliente` confirmados con respuestas completas y correctas.
- [x] **Escalación a Monday.com**: `src/integrations/monday/` (`client.ts` — helper GraphQL genérico, `board.ts` — board ID `5101177200` y column IDs, `create-ticket.ts` — `createSupportTicket()`) + tool `escalar_a_monday` en `src/agent/tools/escalate-to-monday.ts`. El system prompt (`agent/prompt.ts`) ya instruye a Daniel a pedir nombre/email si faltan y a llamar a la tool para escalar en vez de solo decir que va a hacerlo. Columnas que se completan, con las etiquetas reales confirmadas contra el board (vía `settings_str` de cada columna, `NOTAS-INICIALES.md` no las tenía documentadas y las que yo había asumido inicialmente estaban mal):
  - email (`text`), resumen (`text1`), qué se intentó (`long_text_mm5per1v`) — texto libre.
  - urgencia (`status6`): `"No es urgente"` / `"Urgente"`.
  - tipo de solicitud (`status4`): `"Problema"` / `"Solicitud"` / `"Pregunta"`.
  - canal de origen (`color_mm5p5k5s`): en minúscula — fijo en `"slack"` por ahora (único canal activo); otras opciones ya configuradas en el board para cuando existan esos canales: `widget`, `whatsapp`, `instagram`, `messenger`, `telegram`, `default`.
  - **producto** (`color_mm5qwh54`): `"Isabella"` / `"Sofi"` / `"Widget-chatbot"` / `"Otro"`. **Columna nueva, creada por mí en el tablero real** (no existía en la plantilla original) vía `create_column` de la API de Monday — le da al equipo de soporte una forma de filtrar/reportar tickets por producto, dato que Daniel ya conoce por el contexto de la conversación. La columna `Categoría` (`status63`: Equipo/VPN/Software/General) se dejó intacta a propósito — es para tickets de soporte interno (fase 2), no aplica a clientes externos.
  - Estado (`status2`) no se setea — Monday lo deja en su default (`"En curso"`) al crear el item.
  - **Probado end-to-end con el token real** (dos veces, ambos tickets de prueba ya borrados del tablero): un ticket inicial (item id `3122651184`) y uno después de sumar la columna Producto (item id `3122700705`) — ambos aceptados por Monday sin errores.
  - **Probado disparado por Daniel desde Slack en vivo (2026-07-29)**: item `3124652000` (los dos anteriores, `3124599935`/`3124600455`, fueron el intento con el bug de duplicación — ver arriba — y quedaron sin borrar en el tablero real a propósito, no hacen daño). Campos bien completados en los tres.
- [x] **Memoria de conversación + perfil de cliente + escalación progresiva, en MongoDB Atlas (2026-07-30)**: hasta esta sesión, cada mensaje que le llegaba a `askDaniel` era una conversación nueva desde cero. Ahora corre sobre 3 colecciones en la BD `DanielSoporte` (cluster `Cluster0` de Atlas, `MONGODB_URI`/`MONGODB_DB_NAME` en Coolify, conexión lazy en `integrations/mongo/client.ts`):
  - `chat_histories` — un documento por `slackUserId` (no uno por mensaje) con el historial como array embebido, igual al patrón del nodo de memoria de n8n. `askDaniel(mensaje, slackUserId)` carga los últimos 15 mensajes de esa persona (sin expirar por tiempo) y los antepone al system prompt. Memoria tipo "buffer window" (recencia), no vectorizada/semántica.
  - `users` — nombre/email del cliente por `slackUserId`, sin expiración, para no volver a pedirlos en conversaciones futuras aunque hayan pasado semanas.
  - `ticket_drafts` — el borrador de un ticket en construcción. **Este es el mecanismo central de confiabilidad**: en pruebas en vivo, ni `gpt-5-mini` ni `deepseek-v4-pro` recuperaban de forma confiable datos sueltos dados varios turnos atrás (nombre, producto, resumen), ni llamaban a `escalar_a_monday` con la disciplina de "apenas tengas un dato, llamala" que pedía el prompt — preferían juntar todo por chat antes de llamar la tool ni una vez. Solución de fondo: en cada mensaje, `agent/extract-ticket-fields.ts` corre una llamada aparte al LLM (structured output) que extrae lo que se pueda de TODA la conversación, sin depender de que el modelo principal decida usar la tool; `daniel.ts` combina eso con el borrador guardado y el perfil (`mergeTicketFields` en `agent/tools/ticket-fields.ts`, misma función que usa la tool) y lo persiste en `ticket_drafts` ANTES de generar la respuesta. `escalar_a_monday` (ahora una factory, `createEscalateToMondayTool(slackUserId, effectiveDraft)`) puede llamarse con argumentos parciales o ninguno — completa el ticket real en Monday en cuanto los 6 campos requeridos estén presentes entre lo ya guardado y lo que pasó el modelo.
  - **Aprendizaje para futuras sesiones**: si aparece otro "Daniel no recuerda algo que ya le dijeron", la solución confiable no es seguir puliendo el prompt — es sacar ese dato de la memoria del LLM y ponerlo en almacenamiento determinístico (tool con estado en Mongo, extracción estructurada aparte, etc.), como se hizo acá.
  - **Primer test end-to-end en vivo (2026-07-30, tarde): completó un ticket, pero con datos equivocados — bug real encontrado.** `ticket_drafts`/`chat_histories` no tenían límite de tiempo (solo se limpiaban al crear un ticket con éxito), así que un borrador/historial abandonado de una prueba anterior se mezcló con una conversación nueva y no relacionada, y Daniel disparó un ticket real (`3127078337`) con un resumen y producto que el cliente nunca mencionó en esa charla. Fix 1: `daniel.ts` ahora trata una brecha de +1 hora sin mensajes de ese `slackUserId` como sesión nueva y descarta el `chat_histories`/`ticket_drafts` viejo antes de seguir (el perfil de `users` no se ve afectado).
  - **Segundo test en vivo (2026-07-30, tarde, minutos después del primero): el bug reapareció, pero por una causa distinta — el fix de sesión ni llegó a activarse.** Como la prueba se repitió dentro de la misma ventana de 1h, `isNewSession` dio `false` y el `chat_histories` de la prueba anterior (que incluía el mensaje del bot anunciando el ticket erróneo) seguía en el buffer — aunque `ticket_draft` sí se había limpiado tras esa escalación. Resultado: al pedir el email, Daniel **repitió el mismo ticket ID (`3127078337`) de memoria conversacional en vez de volver a llamar a `escalar_a_monday`** — una promesa falsa, no un ticket nuevo creado — y los turnos siguientes repreguntaron datos ya dados. Causa raíz real: `ticket_draft` se limpiaba al crear un ticket con éxito, pero `chat_histories` nunca. Fix 2 (`f06c626`): `clearHistory()` nuevo en `conversation-memory.ts`, llamado junto a `clearTicketDraft()` tanto en `escalate-to-monday.ts` como en `auto-escalate.ts` — un ticket creado con éxito ahora también cierra el historial de chat, para que un tema ya resuelto no pueda filtrarse al siguiente mensaje del mismo cliente. Deployado (push a `main` `f06c626`, auto-deploy vía Coolify), **pendiente de reprobar en vivo** — ver Pendientes abajo. Nota: el `chat_histories` contaminado de este segundo test sigue en Mongo hasta que pase 1h desde el último mensaje (no hubo ticket real creado en ese test que disparara la limpieza nueva) — esperar ese gap o limpiar a mano antes de la próxima prueba.
- [x] **Escalación real a Slack (`#escalacion`), no solo a Monday (2026-07-30)**: `integrations/slack/notify-escalation.ts` postea el detalle de cada ticket creado (por `escalar_a_monday` o por la auto-escalación de abajo) en el canal configurado (`SLACK_ESCALATION_CHANNEL`, default `escalacion`; resuelve el ID vía `conversations.list` y lo cachea). Best-effort: si Slack falla, el ticket en Monday ya quedó creado y solo se loguea un warning. Requiere que `@Daniel-Soporte` esté invitado al canal (ya invitado por Jorge) — **todavía sin confirmar si disparó de verdad**: el primer ticket real creado en esta sesión (`3127078337`, ver arriba) no se verificó si llegó el aviso a `#escalacion` antes de encontrar el bug de datos.
- [x] **Auto-escalación real cuando Daniel falla (2026-07-30)**: antes, si `askDaniel` tiraba error o agotaba las 5 iteraciones de tool-calling, el mensaje de fallback le decía al cliente "ya la voy a escalar a soporte" sin escalar nada — una promesa falsa. Fix: `daniel.ts` lanza `UnresolvedConversationError` en ese caso, y `message-handler.ts` captura cualquier error en un solo `catch`, busca el nombre real del cliente vía `client.users.info`, y llama a `agent/auto-escalate.ts` (`escalateUnresolvedConversation`) que crea un ticket real (urgencia `Urgente`, tipo `Problema`, producto `Otro`) + notifica `#escalacion`. Al cliente se le contesta con el número de ticket real, o un mensaje honesto si eso también falla.
- [x] **Prompt profesionalizado (2026-07-30)**: `agent/prompt.ts` — tono cálido/profesional, alcance acotado a clientes externos (redirige educadamente preguntas fuera de tema), no inventa políticas/precios/descuentos, usa el historial y los datos ya conocidos en vez de repreguntar, criterio de urgencia basado en impacto/frustración real (no solo "urgente si lo dice"), y la regla central de esta sesión: nunca decirle al cliente que se hizo algo si la tool correspondiente no se llamó de verdad.
- [x] **Modelo cambiado a `deepseek/deepseek-v4-pro`, fijo en código (2026-07-30)**: tras las fallas de tool-calling en vivo con `gpt-5-mini` (ver arriba), se probó `deepseek-v4-pro` — mejoró la calidad pero no eliminó el problema por sí solo (de ahí el mecanismo de `ticket_drafts`). El modelo ya no es configurable por `OPENROUTER_MODEL` — es una constante `MODEL` en `agent/model.ts`, decisión explícita de Jorge de que la elección de modelo sea código, no config de deploy.
- [x] **Pasada de seguridad y simplificación con skills instaladas (2026-07-30)**: `security-review` encontró que texto crudo del cliente (en el flujo de auto-escalación) llegaba sin escapar a los mensajes `mrkdwn` de Slack — un cliente podía embeber un link disfrazado (`<https://...|texto>`) que se renderizaba clickeable en el canal interno `#escalacion`, un vector de phishing contra el equipo de soporte. Corregido en `notify-escalation.ts` (escapa `&`/`<`/`>` antes de interpolar cualquier dato del cliente). Después, 4 agentes de revisión (`/simplify`) en paralelo (reuse/simplificación/eficiencia/altitud) encontraron que la lógica de "combinar datos ya conocidos" estaba duplicada entre `daniel.ts` y la tool, y que los enums de urgencia/tipo/producto estaban retipeados en 3 archivos — consolidado en `mergeTicketFields` (`agent/tools/ticket-fields.ts`) y en arrays exportados desde `integrations/monday/create-ticket.ts`. También se sacó el regex de email de respaldo (redundante ya con la extracción por LLM) y se paralelizaron dos operaciones independientes en `daniel.ts`.

**Nota de red de esta máquina**: el fetch nativo de Node (`undici`) tiene timeouts intermitentes (`ETIMEDOUT`) contra hosts externos (pasó con `registry.npmjs.org`, `api.monday.com` y hasta `openrouter.ai`) que `curl` no sufre — parece un problema de resolución/preferencia IPv6 en esta máquina. Si el bot corriendo en otra máquina tiene llamadas que cuelgan o tardan mucho, probar arrancándolo con `NODE_OPTIONS="--dns-result-order=ipv4first" npm run dev:slack` antes de asumir que es un bug de la app.

**Conector MCP de Monday.com disponible (sin usar todavía)**: apareció un conector `claude.ai monday.com` (requiere autenticar corriendo `/mcp` y eligiéndolo de la lista) que no existía cuando se definió el stack original. La integración ya construida (`src/integrations/monday/`) usa la API GraphQL directa y está probada — el MCP no la reemplazó, pero queda como opción para inspeccionar el tablero interactivamente sin escribir queries a mano.

**Auditoría de buenas prácticas backend** (skill `nodejs-backend-patterns`, instalado globalmente, correr `/nodejs-backend-patterns` para volver a ver la guía): ya resueltos — logging estructurado, graceful shutdown (ver arriba), tests básicos y clases de error custom (ver abajo, ambos hechos 2026-07-30 noche). Todavía sin atacar, queda en el backlog general (no bloquea nada del loop v1):
- Rate limiting / HTTPS / CORS / health checks / compression: no aplican todavía porque no hay ningún servidor HTTP expuesto (Slack Socket Mode no lo necesita) — van a importar cuando se construya el widget web (canal #2 del roadmap).

**Tests básicos con Vitest (2026-07-30 noche)**: `npm test` (`vitest run`) — 29 tests en 8 archivos, todos verdes. Cubren `knowledge-base/` (FAQs, clientes), `mergeTicketFields`/`findMissingFields` (incluye test de regresión del bug de contaminación de borradores), `MondayApiError`, `escapeMrkdwn` (regresión del fix de seguridad del link disfrazado), y las 3 tools del agente (`buscar_faqs`, `buscar_cliente`, `escalar_a_monday` con mocks de Monday/Mongo/Slack, verificando el flujo completo de creación de ticket + limpieza de borrador/historial). `tsconfig.json` excluye `src/**/*.test.ts` del build (`dist/` queda sin archivos de test).

**Clase de error custom `MondayApiError` (2026-07-30 noche)**: `integrations/monday/client.ts` — envuelve tanto fallos de red (`fetch` en un try/catch) como errores devueltos por la API de Monday (`body.errors`), en vez de un `Error` genérico. `create-ticket.ts` la usa también para el caso "Monday no devolvió el item creado". Exportada desde `integrations/monday/index.ts`.

## Pendientes / próximos pasos (en orden)

0. **(Próximo paso, bloqueante) Reintentar en vivo el flujo completo de escalación — dos intentos fallidos hasta ahora (2026-07-30, tarde), dos bugs reales encontrados y arreglados, ninguno reprobado todavía.**
   - **Intento 1**: caso "no puedo iniciar sesión en Sofi", datos dados de a uno por mensaje. Daniel creó un ticket real en Monday (item `3127078337`) pero con datos completamente ajenos a la conversación (`resumen="Problema de facturación"`, `producto="Widget-chatbot"`). Causa: `ticket_drafts`/`chat_histories` sin límite de tiempo, un borrador abandonado de una prueba anterior se coló. Fix 1: sesión nueva si pasó +1h sin mensajes de ese cliente (`daniel.ts`, `SESSION_GAP_MS`) — descarta `chat_histories`/`ticket_drafts` viejo, no toca el perfil (`users`).
   - **Intento 2** (minutos después del 1, mismo día): el fix de sesión ni se activó porque la prueba estuvo dentro de la misma ventana de 1h. `chat_histories` de la prueba fallida seguía en el buffer (solo `ticket_draft` se había limpiado al "crear" el ticket 1). Daniel, viendo en el historial que ya había una escalación, **repitió el mismo ticket ID de memoria en vez de volver a llamar a `escalar_a_monday`** — una promesa falsa, no un ticket nuevo. Causa raíz real: `chat_histories` nunca se limpiaba al crear un ticket con éxito, solo `ticket_draft`. Fix 2 (`f06c626`): `clearHistory()` ahora se llama junto a `clearTicketDraft()` en `escalate-to-monday.ts` y `auto-escalate.ts`.
   - **Estado del código**: ambos fixes compilan limpio y están deployados (push a `main`, auto-deploy Coolify). **Ningún fix fue reprobado en vivo todavía.**
   - **Confirmado directamente en Mongo (2026-07-30 noche)**, conectando desde esta máquina con el workaround DNS-over-HTTPS (ver sección de credenciales arriba): `chat_histories` (`slackUserId U0BJZDZRSQZ`, el de Jorge) todavía tiene los 8 mensajes de los dos intentos mezclados en un solo documento (`updatedAt` 2026-07-30T14:51:14Z, el momento del intento 2, justo antes del fix `f06c626`), y `ticket_drafts` tiene el borrador a medio completar de ese mismo intento 2 (`producto: "Widget-chatbot"`, `resumen` sobre facturación). Como el fix de `clearHistory()` recién se deployó después de ese intento, esta contaminación es exactamente la esperada y no indica un tercer bug nuevo.
   - **Limpieza pendiente — bloqueada para mí, requiere acción manual de Jorge**: intenté borrar ambos documentos (`deleteOne({slackUserId: "U0BJZDZRSQZ"})` en `chat_histories` y `ticket_drafts`) con un script Node directo contra Mongo; el clasificador de auto-mode de Claude Code bloqueó la ejecución por tratarse de un borrado contra una base de datos de producción, incluso con confirmación explícita de Jorge en el chat. Pendiente que Jorge lo borre a mano en MongoDB Compass o en la consola web de Atlas (Collections → `chat_histories` / `ticket_drafts` → filtro `{slackUserId: "U0BJZDZRSQZ"}` → Delete) antes de la próxima prueba. Alternativa sin limpiar nada: esperar a que pase 1h desde `2026-07-30T14:51:14Z` (ya pasó ampliamente a esta hora), en cuyo caso el fix de sesión (`SESSION_GAP_MS`) debería descartar el historial viejo solo, aunque limpiarlo a mano es más prolijo y confirma el estado antes de la prueba.
   - **Ticket incorrecto sin borrar**: el item `3127078337` en el board `5101177200` quedó sin borrar (el clasificador de seguridad de Claude Code bloqueó la mutación de borrado vía API, incluso con aprobación explícita de Jorge en el chat) — borrar a mano desde Monday si hace falta limpiar el board.
   - **Para la próxima prueba**: repetir el mismo tipo de caso (datos de a uno por mensaje, después de esperar/limpiar el gap) y confirmar que: (a) el ticket creado refleja el problema real dicho en la conversación, (b) no repregunta datos ya dados, (c) no "olvida" ni "reinventa" una escalación, (d) aparece el aviso en `#escalacion`, (e) el perfil queda guardado. Si vuelve a fallar con datos ajenos a la conversación pese a los dos fixes, no asumir que alcanza con más limpieza de estado — puede haber una tercera vía (p. ej. el modelo de extracción infiriendo de más pese a la instrucción de no inventar) que requiera revisar `extract-ticket-fields.ts` directamente.
1. **Mover el bot a un VPS — HECHO (2026-07-29/30)**. Daniel corre en producción en el VPS, desplegado con Coolify, y fue confirmado respondiendo en vivo en Slack (`@Daniel-Soporte`) el 2026-07-30.
   - **VPS**: Hostinger KVM 1, `srv853599.hstgr.cloud` / IP `82.29.180.111`, Frankfurt, usuario `root`. Es infraestructura compartida de RedTec (varios bots podrían vivir aquí).
   - **Cambio de approach**: se descartó tanto el plan original de `docker compose up -d` manual vía SSH como el Docker Manager nativo de Hostinger. En su lugar se **wipeó el VPS entero** (incluyendo el viejo proyecto Compose `traefik` y el firewall `RedTecAi-Capa1`) y se instaló **Coolify** como PaaS (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`) para manejar builds, env vars y el reverse proxy de forma centralizada. Dashboard en `http://82.29.180.111:8000`.
   - **Firewall**: se recreó desde cero un rule set en el panel de Hostinger llamado `GENERAL` (el `RedTecAi-Capa1` original quedó desactivado) con reglas Accept/TCP/Any para los puertos `22` (SSH), `80`, `443`, `8000` (dashboard Coolify), `6001-6002` (realtime de Coolify). Cada cambio de reglas requiere click en **Synchronize** para propagarse al servidor.
   - **Gotcha de Hostinger encontrado**: el panel puede quedar en "Impersonate mode" (viendo la cuenta de otro usuario, ej. soporte) sin avisarlo claramente — en ese estado, cualquier edición de firewall falla con un toast "Unauthorized" que parece un bug de permisos pero es solo modo de solo-lectura. Se resuelve saliendo del banner naranja "Impersonate mode" y logueando con las credenciales reales del dueño.
   - **Deploy real**: repo `GarooInc/Daniel-Agent` puesto en **público** en GitHub (decisión de Jorge, para saltarse deploy keys) y agregado en Coolify como Application → **Public Repository**, branch `main`, Build Pack **Dockerfile** (usa el `Dockerfile`/`.dockerignore` ya commiteados en el repo — build multi-stage con `node:24-alpine`, corre `dist/slack.js`). Healthcheck HTTP deshabilitado a propósito (Daniel no expone servidor HTTP, Slack corre en Socket Mode saliente). Las 5 credenciales reales (`OPENROUTER_API_KEY`, `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `MONDAY_API_TOKEN`) se cargaron directo en la pestaña Environment Variables de Coolify — no se subió ningún `.env` por scp.
   - **Confirmado en vivo (2026-07-30)**: build y rolling update exitosos en Coolify, y respuesta real de Daniel en el canal de Slack al mensaje de prueba "Hola".
   - **Pendiente (seguridad, no bloqueante)**: re-restringir la regla SSH (puerto 22) a una IP específica en vez de `Any`, ahora que el setup está estable.
   - **Auto-deploy activado (2026-07-30)**: webhook de GitHub configurado apuntando a `http://82.29.180.111:8000/webhooks/source/github/events/manual` (Coolify → Configuration → Webhooks). Cada push a `main` dispara un deploy automático — ya no hace falta entrar al dashboard a darle Redeploy manual.

## Referencia rápida del stack

Node.js + TypeScript · Slack vía `@slack/bolt` (Socket Mode) · Orquestación con LangChain.js · LLM vía OpenRouter · Persistencia v1 en JSON simples · Escalación vía API GraphQL de Monday.com (board `5101177200`) · Logging con `pino`.

**Nota**: Express estaba en el plan original del stack pero **todavía no se instaló ni se usa** — no hizo falta porque todo el tráfico entra por Slack Socket Mode, que no necesita servidor HTTP. Va a hacer falta recién con el widget web (canal #2 del roadmap).

Detalle completo de cada decisión y por qué se tomó: `NOTAS-INICIALES.md`.
