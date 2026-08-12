# Estado del proyecto — Daniel Agent

Última actualización: 2026-08-12

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
- `WEBHOOK_PORT` (opcional, default `3300`) y `WEBHOOK_SECRET` (opcional — si no se setea, el webhook de abajo queda sin autenticar; nuevo 2026-08-11, ver sección del webhook)

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
      platform-health.ts        # estado_de_la_plataforma: lee platform_metrics (Mongo), nunca el socket en vivo
      escalate-to-monday.ts
      ticket-fields.ts          # campos requeridos, merge compartido, labels
      index.ts

  channels/               # un canal por carpeta (Slack hoy, web widget/WhatsApp después)
    slack/
      bot.ts
      message-handler.ts
      index.ts
    webhook/                # nuevo 2026-08-11: entrada HTTP genérica (no Slack), ver más abajo
      server.ts
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
      webhook-events.ts             # webhook_raw_events: payloads crudos del webhook, ver abajo
    slack/
      notify-escalation.ts     # avisa cada ticket creado en el canal #escalacion
    redtec-realtime/          # WebSocket de tiempo real de RedTec Realstate (socket.io), ver abajo
      client.ts                 # conexión singleton, no bloqueante si faltan credenciales
      platform-metrics.ts        # persiste container.stats en Mongo (platform_metrics, TTL 7 días) + consultas por ventana
      crm-events-cache.ts          # persiste lead.*/appointment.* en platform_events, sin lectura expuesta todavía
      container-logs.ts             # utilidad interna para get_container_logs — NO conectada a ninguna tool

  data/
    faqs.json
    customers.json

plans/                    # planes de features grandes (Markdown), commiteados al repo
  2026-08-06-redtec-realtime-websocket.md
  2026-08-12-roadmap-premium-profesional.md   # evaluación estratégica: qué falta para pasar de v1 a producto premium/profesional
  2026-08-12-agente-tecnico-n8n-spectrum.md   # diseño (sin código todavía) de un segundo agente IA que audita n8n vía MCP y se comunica con Daniel por un canal de Slack compartido
```

Regla simple para el futuro: nueva tool → un archivo en `agent/tools/`; nuevo canal (web widget, WhatsApp) → una carpeta nueva en `channels/`; nueva integración externa (CRM, etc.) → una carpeta nueva en `integrations/`; nueva fuente de datos real → reemplazar la implementación en `knowledge-base/` sin tocar el resto.

**Convención de `plans/` (2026-08-06)**: el plan que arma Claude Code en modo plan (`ExitPlanMode`) solo queda por defecto en `~/.claude/plans/` de la máquina donde se corrió — no viaja con el repo. Para que un plan de una feature grande se pueda retomar/consultar desde cualquier otra PC (no solo la que lo escribió), se copia a `plans/<fecha>-<nombre-corto>.md` en el repo y se commitea junto con el código. No hace falta para cambios chicos — solo para features con diseño/discusión que valga la pena preservar.

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
- [x] Base de conocimiento ficticia: `src/data/faqs.json` (16 FAQs de ejemplo: Isabella, Sofi, widget-chatbot — uso, configuración, funcionalidades, facturación) y `src/data/customers.json` (7 clientes/cuentas de ejemplo con distintos estados: activo, moroso, en_prueba, cancelado). Loader tipado en `src/knowledge-base/` (`faqs.ts`, `customers.ts`, `types.ts`) con `searchFaqs`, `getFaqsByProducto`, `getCustomerByEmail`, `getAllFaqs`, `getAllCustomers`. Probado en runtime con `tsx`, funciona. **Desactualizado (ver "Paso 5" abajo, 2026-08-06): `searchFaqs`/`getFaqsByProducto` se borraron al migrar las FAQs a búsqueda semántica — solo queda `getAllFaqs`, ahora usada por el script de migración. `customers.json`/`getCustomerByEmail` siguen igual que acá.**
- [x] **Agente LangChain.js + OpenRouter**: `src/agent/` (`prompt.ts`, `model.ts`, `daniel.ts`, `tools/`), función `askDaniel(mensaje)` exportada desde `src/agent/index.ts`. Usa `ChatOpenAI` de `@langchain/openai` apuntando a `baseURL: https://openrouter.ai/api/v1` con `OPENROUTER_API_KEY`. Modelo fijo en código (`agent/model.ts`, constante `MODEL`), no en variable de entorno: `deepseek/deepseek-v4-pro` desde el 2026-07-30, después de que `gpt-5-mini` no siguiera de forma confiable el tool-calling en pruebas en vivo (ver detalle más abajo). Si hace falta volver a probar otro modelo, cambiar esa constante. Tres tools en `agent/tools/`: `buscar_faqs` (envuelve `searchFaqs` — **desactualizado, ver "Paso 5" abajo: ahora hace búsqueda semántica, no keyword-match**), `buscar_cliente` (envuelve `getCustomerByEmail`) y `escalar_a_monday` (crea el ticket, ver abajo). Loop manual de tool-calling (hasta 5 iteraciones, en `daniel.ts`) en vez de un agente prearmado de LangChain — más simple y suficiente para v1. Type-checkea limpio. Se puede probar suelto con `npx tsx src/agent-cli.ts "pregunta"` (`npm run dev:agent`). **Probado en vivo con `OPENROUTER_API_KEY` real (2026-07-29)**: `buscar_faqs` y `buscar_cliente` confirmados con respuestas completas y correctas.
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
- [x] **Fix: `auto-escalate.ts` ahora usa el `ticket_draft` real (2026-07-31, commit `969b292`)**: bug encontrado en prueba en vivo (turno del email). Antes, la auto-escalación siempre creaba el ticket con `producto="Otro"`, `urgencia="Urgente"` y `resumen=texto_crudo_del_último_mensaje`, ignorando por completo los datos que `extractTicketFields` había acumulado en `ticket_drafts` durante la conversación. Fix: `escalateUnresolvedConversation` ahora lee el `ticket_draft` de Mongo y hace `mergeTicketFields(draft, perfil)` antes de armar el ticket. Solo cae a los fallbacks genéricos si el draft no tiene ese campo. Agrega `auto-escalate.test.ts` con 6 tests (35 tests totales, todos verdes).
- [x] **Script de test E2E automatizado (2026-07-31, `src/test-e2e.ts`)**: `npm run test:e2e` corre un flujo completo de conversación multi-turno (5 turnos, datos dados de a uno) con LLM real (OpenRouter) y Monday.com real, usando un in-memory store en vez de MongoDB. Crea un ticket de prueba, verifica sus campos en Monday y lo borra al terminar. No requiere MONGODB_URI ni intervención manual. **Resultado: 9/9 checks pasaron.**
- [x] **Fix: `clearHistory` diferido tras respuesta final y reintento de conexión en `client.ts` (2026-07-31)**:
  - **Historial limpio (9/9 checks E2E)**: Se corrigió el orden de limpieza. `clearHistory` ahora se ejecuta *después* de guardar la respuesta final de la IA en `chat_histories`, asegurando que `chat_histories` quede en 0 mensajes tras una escalación exitosa.
  - **Reintento de conexión MongoDB**: `client.ts` ahora resetea `dbPromise = undefined` en el `catch` si falla la conexión inicial o la creación de índices, permitiendo reintentar la conexión en llamadas posteriores si hubo una falla de red o DNS temporal.
- [x] **Instancia fantasma respondiendo en paralelo a producción — resuelta (2026-08-04/05)**: ver "Hallazgo mayor" abajo para el diagnóstico completo. Se rotaron los tokens de Slack (App Token sobre todo, es el que sostiene Socket Mode) y el fantasma dejó de responder — confirmado en varios retests posteriores sin duplicados.
- [x] **Debounce/cola de mensajes con Redis (2026-08-03/04)**: ver "Plan pendiente" abajo, Pasos 1-4, para el detalle completo (4 bugs de infra/código encontrados y arreglados). `DEBOUNCE_MS = 10000` en producción, confirmado funcionando en vivo.
- [x] **KB de FAQs vectorizada en Mongo Atlas (2026-08-06)**: ver "Paso 5" abajo para el detalle completo (embeddings vía OpenRouter, vector search clásico calcado de otro proyecto de RedTec, `buscar_faqs` reemplazada). Confirmado funcionando end-to-end en Slack.
- [x] **Ronda de bugs reales encontrados y arreglados en la semana del 2026-08-04 al 2026-08-06** (todos confirmados en vivo, ver las secciones "Retest en vivo" abajo para el detalle de cada uno):
  - `clearHistory()` faltante en la rama de sesión nueva de `daniel.ts` (historial viejo se filtraba a conversaciones nuevas).
  - `""` (string vacío) tratado como valor presente en `mergeTicketFields` (tapaba datos ya conocidos del perfil).
  - Extracción confundiendo un nombre de producto ("Sofi") con el nombre del cliente, corrompiendo el perfil persistente.
  - Markdown estándar del LLM (`**negrita**`) no se traducía al mrkdwn de Slack.
  - Asimetría en el texto embebido de `buscar_faqs` cuando el producto se pasa como filtro aparte.
  - Cold-start de Mongo en cada redeploy (el más grave — tumbaba cualquier mensaje, no solo FAQs).
  - Scope `users:read` faltante en Slack para el fallback de auto-escalación.

**Nota de red de esta máquina**: el fetch nativo de Node (`undici`) tiene timeouts intermitentes (`ETIMEDOUT`) contra hosts externos (pasó con `registry.npmjs.org`, `api.monday.com` y hasta `openrouter.ai`) que `curl` no sufre — parece un problema de resolución/preferencia IPv6 en esta máquina. Si el bot corriendo en otra máquina tiene llamadas que cuelgan o tardan mucho, probar arrancándolo con `NODE_OPTIONS="--dns-result-order=ipv4first" npm run dev:slack` antes de asumir que es un bug de la app.

**Conector MCP de Monday.com disponible (sin usar todavía)**: apareció un conector `claude.ai monday.com` (requiere autenticar corriendo `/mcp` y eligiéndolo de la lista) que no existía cuando se definió el stack original. La integración ya construida (`src/integrations/monday/`) usa la API GraphQL directa y está probada — el MCP no la reemplazó, pero queda como opción para inspeccionar el tablero interactivamente sin escribir queries a mano.

- [x] **Webhook HTTP genérico para recibir datos internos de otros agentes/la empresa (2026-08-11, commit `b31bb96`)**: primer endpoint HTTP real de este proyecto — hasta ahora todo el tráfico entraba por Slack Socket Mode, sin servidor HTTP. `POST /webhook/internal`, servido con `node:http` nativo (no se sumó Express — decisión deliberada, ver nota en "Referencia rápida del stack" abajo), en el mismo proceso que el bot de Slack (arranca/cierra junto a `startSlackBot()` en `channels/slack/bot.ts`). No se conoce todavía la estructura real de lo que va a llegar (viene de otros agentes de RedTec y sistemas internos de la empresa), así que el diseño es deliberadamente "capturar todo crudo, no asumir schema":
  - Loguea con `pino` el body completo (headers + payload, parseado como JSON si se puede) de cada request.
  - Guarda cada evento crudo en Mongo, colección `webhook_raw_events` (`integrations/mongo/webhook-events.ts`) — para poder revisarlos con calma y definir el schema real más adelante, no solo en logs efímeros.
  - Responde `200 {"ok":true}` siempre, incluso si falla el guardado en Mongo (no bloquea al emisor) — el log ya capturó el dato como respaldo.
  - `404` fuera de la ruta, `405` si no es POST, `413` si el body pasa 5MB.
  - Autenticación opcional por header `x-webhook-secret` contra `WEBHOOK_SECRET` — si no está seteada, el endpoint queda abierto a propósito (fase exploratoria). Ya seteada en Coolify.
  - **Puerto**: `WEBHOOK_PORT` (default `3300`), `EXPOSE 3300` agregado al `Dockerfile`.
  - **Bug/gotcha real de infra encontrado en el primer deploy — 502 Bad Gateway**: el contenedor arrancaba perfecto (`Servidor de webhook escuchando... port: 3300` en los logs, Mongo/Redis/Slack conectados), pero el dominio (`bm6cobx1321sflq2l99qrsvu.82.29.180.111.sslip.io`, generado por Coolify meses atrás sin nunca usarse — el bot nunca necesitó HTTP) devolvía 502 en toda request. Causa: el campo **"Ports Exposes"** de Coolify (tab General → Network) tenía el default `3000` sin tocar, y las labels de Traefik/Caddy que Coolify autogenera (`loadbalancer.server.port=3000`, sección Labels, marcada "Readonly" porque se derivan de ese campo) apuntaban ahí — nada escuchaba en 3000, de ahí el Bad Gateway aunque la app estuviera sana. Fix: cambiar "Ports Exposes" a `3300` + Save + **Redeploy completo** (un simple Save no alcanza, hace falta redeployar para que Traefik regenere las labels). **Confirmado en vivo (2026-08-11)**: `curl` real contra el dominio da `404` en ruta desconocida, `401` sin `x-webhook-secret`, `200 {"ok":true}` con el secreto correcto.
  - **Se intentó activar HTTPS en el dominio y Coolify lo bloqueó con un warning correcto**: los dominios `*.sslip.io` son compartidos entre muchos usuarios y Let's Encrypt les aplica rate-limiting agresivo — la validación del certificado iba a fallar. Se dejó en `http://` a propósito (ver Pendientes abajo, hace falta un dominio propio para HTTPS real).
  - **Nota para la próxima vez que se expone un puerto nuevo en esta app en Coolify**: revisar el campo "Ports Exposes" explícitamente, no asumir que el `EXPOSE` del Dockerfile alcanza — es la causa más probable de un 502 con la app sana por dentro.
- [x] **WebSocket de tiempo real de RedTec Realstate — código completo, sin deployar todavía (2026-08-06, mergeado a `main` el 2026-08-12)**: RedTec expone un canal `socket.io` único de plataforma (`wss://<dominio>/realtime`, guía `realtime-websocket-guide.pdf`) con eventos de CRM (`lead.*`/`appointment.*`, con `tenantId`) y métricas de infra de sus 2 contenedores (`container.stats` cada 30s + `get_container_logs` bajo demanda). Alcance de esta primera pasada, decidido con Jorge: **solo infra por ahora** — los eventos de CRM se ingieren y cachean pero no se exponen como tool (no existe todavía un mapeo cliente-de-Slack → `tenantId` en el codebase; construir esa tool sin eso arriesgaría mezclar datos de un tenant en la conversación de otro). Nueva carpeta `src/integrations/redtec-realtime/` (ver árbol arriba):
  - **Principio de diseño**: nada de leer el socket "en vivo" al momento de responder una pregunta ni mantener el único estado en memoria — todo lo que empuja el socket se persiste en Mongo apenas llega (`platform_metrics`, TTL 7 días; `platform_events`, sin lectura expuesta todavía) y la tool consulta Mongo con filtros de tiempo. Así no se pierde nada entre redeploys de Coolify ni queda un estado de proceso poco confiable.
  - **Tool nueva `estado_de_la_plataforma`** (`agent/tools/platform-health.ts`): argumento opcional `sinceMinutes` — sin él devuelve la última foto conocida (CPU/mem/disco); con él agrega picos sobre esa ventana ("¿cómo estuvo el sistema en la última hora?"). Registrada en `agent/tools/index.ts`, mencionada en `agent/prompt.ts`.
  - **Logs crudos de contenedor restringidos a propósito**: `container-logs.ts` implementa `requestContainerLogs()` (con allow-list de nombre de contenedor del lado cliente, además del que ya hace el servidor) pero **no está conectada a ninguna tool del agente** — un log crudo puede traer stack traces, IPs internas o datos de otro tenant, y exponerlo a un LLM en conversación con un cliente externo es un vector de fuga de datos. Queda como utilidad interna para uso manual/futuro.
  - `client.ts`: conexión `socket.io-client` singleton, deliberadamente **no bloqueante** — si `REDTEC_PLATFORM_WS_URL`/`REDTEC_PLATFORM_WS_SECRET` no están seteadas (ver "Pendientes" abajo), loguea y no conecta, el resto del bot sigue funcionando igual. Wireada en `bot.ts` junto al resto del calentamiento de boot/shutdown.
  - Type-check limpio, 8 tests nuevos (52/52 en total). **Sin deployar/probar en vivo todavía** — depende de que RedTec confirme URL y secreto reales (ver Pendientes).
## Plan pendiente: debounce/cola de mensajes con Redis + KB vectorizada en Mongo Atlas (iniciado 2026-08-03)

Decisión de Jorge (2026-08-03): la KB va a vivir vectorizada en MongoDB Atlas, y hace falta Redis en el VPS para debounce/cola de mensajes multi-línea (pensando en WhatsApp y otros canales de mensajería, donde un cliente manda varios mensajes seguidos que hoy dispararían varias llamadas paralelas a `askDaniel`). Orden acordado: **primero el debounce/cola (bloqueante para WhatsApp), después la KB vectorizada** (migrando el contenido ya existente de `faqs.json`/`customers.json`, no contenido nuevo).

**Infra ya lista**: Redis ya está desplegado en Coolify como recurso de base de datos dentro del proyecto `daniel-agent` (junto a la app), status healthy, `Server: localhost` — no hace falta instalarlo, falta conectarlo a la app.

### Paso 0 — Conseguir la connection string de Redis (bloqueante, Jorge)
- En Coolify → proyecto `daniel-agent` → recurso `Redis` → pestaña de configuración → copiar la **Internal Connection String**.
- Agregarla en Coolify, en la app `daniel--agent`, Environment Variables, como `REDIS_URL`.

### Paso 1 — Groundwork de código (HECHO, commiteado)
- `package.json`: agregadas dependencias `ioredis` y `bullmq`. `npm install` corrido (32s, 15 paquetes, 0 vulnerabilidades) — el `ETIMEDOUT` intermitente contra `registry.npmjs.org` de esta máquina apareció en el primer intento y se resolvió reintentando sin cambios.
- `src/config/env.ts`: `REDIS_URL` agregado a `REQUIRED_ENV_VARS` y a `env.redisUrl`.
- `src/integrations/redis/client.ts`: conexión lazy a Redis (`getRedis()`), mismo patrón que `integrations/mongo/client.ts`, más `getRedisConnectionOptions()` (BullMQ necesita `maxRetriesPerRequest: null`) y `closeRedis()`.
- `.env.example` actualizado con `REDIS_URL`.

### Paso 2 — Módulo de debounce/cola (HECHO, `src/messaging/debounce-queue.ts`, 2026-08-03/04)
Implementado channel-agnostic, para que Slack y WhatsApp compartan la misma lógica:
- `bufferMessage(source, userId, conversationId, texto)`:
  - `RPUSH` del texto a una lista Redis `buffer:{source}:{userId}`.
  - Busca el job delayed existente en la cola BullMQ `message-debounce` (`jobId = "{source}:{userId}"`); si existe y sigue `delayed`, lo remueve.
  - Vuelve a agregar el job con el mismo `jobId`, `delay: DEBOUNCE_MS` (4000ms) y payload `{source, userId, conversationId}` — reinicia la ventana de espera en cada mensaje nuevo del mismo usuario y actualiza el `conversationId` por si cambió. `removeOnComplete`/`removeOnFail: true` para que el `jobId` quede libre de nuevo apenas se procesa (si no, BullMQ reusa el job "completed" en vez de crear uno nuevo delayed).
  - Si el `add` falla (caso raro: el job anterior está `active` justo en ese instante), se loguea un warning y no rompe — el mensaje ya quedó en el buffer y se recoge en el próximo flush que dispare ese usuario.
- `startDebounceWorker(onFlush)`: `Worker` de BullMQ que al dispararse hace `LRANGE`+`DEL` de la lista bufferizada, junta los mensajes con `\n` y llama a `onFlush(source, userId, conversationId, textoJunto)`.
- `closeDebounceQueue(worker)`: cierra Worker + Queue prolijamente para el shutdown.
- Por qué BullMQ y no un `setTimeout` en memoria: sobrevive restarts/deploys de Coolify y deja la base para escalar a múltiples instancias/canales (WhatsApp) sin reescribir la lógica.

### Paso 3 — Refactor de `channels/slack/message-handler.ts` (HECHO)
- Extraída la lógica de `askDaniel` + manejo de error/auto-escalación + respuesta a `handleResolvedMessage(client, slackUserId, texto, respond)` — `respond` es un callback genérico (`say()` o `chat.postMessage`), así la puede llamar tanto el handler de mensaje entrante como el `onFlush` del worker.
- `registerMessageHandler` ahora solo dedupea por `client_msg_id` (igual que antes) y llama `bufferMessage("slack", slackUserId, channelId, texto)` en vez de `askDaniel` directo.
- `bot.ts`: después de `registerMessageHandler`, arranca `startDebounceWorker(...)` con un callback que usa `app.client.chat.postMessage({channel: channelId, text})` para responder.
- Shutdown (`SIGINT`/`SIGTERM` en `bot.ts`) ahora también cierra el Worker/Queue de BullMQ (`closeDebounceQueue`) y `closeRedis()`, además de `app.stop()`.
- Verificado: `npx tsc --noEmit` limpio y `npm test` 37/37 verdes (sin tests nuevos para el debounce todavía — necesita Redis real o un mock, no se agregó en esta pasada).

### Paso 4 — Probar en vivo (HECHO, 2026-08-04 — confirmado funcionando)

`REDIS_URL` ya está cargado y funcionando en Coolify. Se encontraron y arreglaron **tres bugs reales distintos** antes de que el debounce empezara a andar:

1. **Formato de la URL**: la contraseña necesitaba `:` antes (`redis://:PASSWORD@host`, no `redis://PASSWORD@host`) — sin eso, el parser de URL trata todo el bloque como usuario en vez de contraseña.
2. **Hostname mal copiado — letra O vs número 0**: el campo "Redis URL (internal)" de Coolify mostraba el host terminado en `...jaqOs` (letra O), pero el hostname real que Docker resuelve (confirmado contra el `--add-host` que Coolify genera en cada build) es `...jaq0s` (número 0). Con la letra, la conexión no fallaba con un error — se quedaba colgada para siempre intentando resolver un host que no existe, porque `maxRetriesPerRequest: null` (necesario para BullMQ) hace que ioredis reintente indefinidamente sin nunca rechazar el comando. Esto se diagnosticó agregando un `getRedis().ping()` en el arranque (`bot.ts`) con log de éxito/error — reveló el cuelgue silencioso.
3. **Contraseña desincronizada**: incluso con el hostname y formato corregidos, seguía devolviendo `WRONGPASS` (probado tanto con `redis://:PASSWORD@host` como con `redis://default:PASSWORD@host`, usuario explícito). Se resolvió **regenerando la contraseña de Redis** directo en Coolify (recurso Redis → Configuration → General → Password → Save) y volviendo a copiar el "Redis URL (internal)" ya actualizado. Confirmado con `PONG` en el log de `DEBUG redis ping ok`. Causa exacta de la desincronización original: sin determinar (no crítico ahora que se regeneró).

**Cuarto bug, este sí en nuestro código, y el que realmente bloqueaba el debounce completo**: `src/messaging/debounce-queue.ts`'s `jobId(source, userId)` devolvía `"slack:USERID"` (con `:`), y **BullMQ prohíbe `:` en IDs de job personalizados** (`Error: Custom Id cannot contain :`, tirado dentro de `Queue.add()`). Como ese error caía en el `catch` de `bufferMessage` y solo logueaba un warning, **nunca se llegó a agendar ni un solo job de debounce** en ninguna prueba anterior a este fix (commit `13427d9`) — por eso todas las respuestas anteriores llegaban casi instantáneas, sin importar el valor de `DEBOUNCE_MS`. Fix: separador cambiado a `_` (`"slack_USERID"`).

**Efecto colateral del bug del jobId**: como el `RPUSH` a la lista de Redis (`buffer:slack:USERID`) sí funcionaba siempre (solo fallaba el `add` del job), **los mensajes de todas las pruebas fallidas de esta sesión quedaron acumulados sin límite en esa lista**, porque nunca hubo un worker que hiciera `LRANGE`+`DEL`. El primer flush exitoso después del fix trajo mezclado contenido viejo (`"hola"`, `"tengo problemas con isabella"` de pruebas anteriores) junto con el mensaje nuevo. Ya se limpió solo (el flush hace `DEL` después de leer), así que las prueban siguientes deberían partir de un buffer limpio.

**Resuelto (2026-08-04, misma sesión): la "3 respuestas separadas" no era un bug de código — era timing de la prueba manual.** Con los 4 bugs de arriba ya resueltos, una prueba con 3 mensajes escritos a mano en Slack seguía dando respuestas separadas en vez de una sola combinada. Subir `DEBOUNCE_MS` temporalmente a 30000 (commit `93850d6`) para dar más margen confirmó la causa real: escribir 3 mensajes a mano toma más de 10s entre alguno de ellos, así que el job del mensaje anterior ya se disparaba antes de que llegara el siguiente — comportamiento esperado del debounce, no una falla. Con margen de 30s, el log mostró la secuencia correcta (2do y 3er mensaje con `existingState:"delayed"`, cancelando y reagendando el job) y **un solo flush con `count:3`**, y Daniel respondió una sola vez cubriendo los 3 mensajes. `DEBOUNCE_MS` se devolvió a `10000` (valor de producción, decisión de Jorge) una vez confirmado. Todo el logging de debug temporal (`bot.ts`, `message-handler.ts`, `debounce-queue.ts` — dump de eventos crudos, timeout de 8s alrededor de `bufferMessage`, contenido de mensajes en el log de flush) fue removido; el ping de Redis al arrancar se mantuvo como chequeo de salud permanente, sin el prefijo "DEBUG".

**Fricción de herramientas de Coolify encontrada en esta sesión (no relacionada al código, pero relevante para seguir debuggeando)**:
- El panel de **Logs** no se actualiza solo ni con el ícono de refresh — hay que recargar la página completa (F5) cada vez para traer líneas nuevas.
- La pestaña **Terminal** (tanto en la app como en el recurso Redis) tira "Terminal websocket connection lost" de forma consistente — no se pudo usar en toda la sesión.
- El log de **Deployments** (build) es distinto del de **Logs** (runtime) — hay que mirar el correcto según lo que se necesite ver.

**Logging de debug temporal agregado esta sesión — sacar una vez que el debounce esté 100% confirmado andando bien**:
- `src/channels/slack/bot.ts`: ping a Redis al arrancar (`DEBUG redis ping ok/falló`).
- `src/channels/slack/message-handler.ts`: log del evento crudo de Slack antes de cualquier filtro, y log antes/después/catch de `bufferMessage` con timeout de 8s.
- `src/messaging/debounce-queue.ts`: logs `DEBUG bufferMessage`, `DEBUG job agendado`, `DEBUG flush de debounce` (este último loguea el array completo de mensajes, útil para diagnosticar pero verboso para dejar en producción).

**Nota de seguridad encontrada de paso (no bloqueante)**: Coolify hornea todos los secrets de la app (`REDIS_URL` incluido) como `ARG` de Docker durante el build — quedan visibles en el historial de capas de la imagen. Hay un checkbox "Use Docker Build Secrets" sin tildar en la pantalla de Environment Variables que probablemente evite esto — pendiente de revisar, no bloquea el trabajo actual.

**Cuando se retome**: pedir el log fresco (F5) de la prueba de "mensaje uno/dos/tres" para ver cuántos `DEBUG evento de mensaje crudo recibido` / `DEBUG job agendado` / `DEBUG flush de debounce` aparecieron — eso va a decir si el problema es que cada mensaje sigue generando su propio job (algo en la lógica de "buscar y remover el job delayed existente" no está encontrando el job anterior) o algo distinto.

- **Importante, todavía por confirmar una vez que el debounce ande bien**: con este cambio, hasta un mensaje único ahora tarda ~10s más en responder (pasa siempre por el debounce, no solo cuando hay ráfaga) — confirmar que ese delay es aceptable en uso real, o bajarlo.

### Paso 5 — KB vectorizada en Mongo Atlas (HECHO, 2026-08-06, solo FAQs — customers.json queda para después)

Diseño calcado de un patrón ya probado en otro proyecto de RedTec/Spectrum (`Centralizado.documents`, 200 documentos reales en producción, otro cluster de Atlas al que Jorge dio acceso puntual para inspeccionar el schema): vector search **clásico** (embedding pre-calculado, no Auto-Embed de Atlas), 1536 dimensiones, similarity `cosine`, con un campo de filtro pre-vector-search. Se descartó vectorizar `customers.json` — un lookup de cliente por email exacto no se beneficia de similarity search, se deja para una migración simple a colección Mongo plana más adelante.

- **Embeddings vía OpenRouter** (`src/integrations/embeddings/openrouter-embeddings.ts`): `openai/text-embedding-3-small` a través de `https://openrouter.ai/api/v1/embeddings` — mismo modelo/dimensión (1536) que ya usa Centralizado, y reusa `OPENROUTER_API_KEY` existente sin sumar una credencial nueva. `embedTexts()` acepta batch (la migración embebe las 16 FAQs en una sola llamada).
- **Colección `documents`** (`src/integrations/mongo/documents.ts`, DB `DanielSoporte`): `upsertFaqDocument()` (upsert por `id`, idempotente), `ensureFaqVectorIndex()` (crea el índice `faq_vector_index` si no existe — campo vector `embedding`, 1536 dims, cosine; campo de filtro `producto`, equivalente al `proyecto` de Centralizado), `searchFaqsBySimilarity()` ($vectorSearch + proyección con `score: { $meta: "vectorSearchScore" } }`).
- **Script de migración** (`src/migrate-faqs.ts`, `npm run migrate:faqs`): lee `getAllFaqs()`, embebe, upsertea, crea el índice. Idempotente — se puede correr de nuevo si se edita `faqs.json`.
- **`agent/tools/search-faqs.ts` reemplazada**: ya no usa el keyword-match viejo — embebe la consulta del cliente, busca por similitud (con `producto` opcional como pre-filtro), y descarta resultados con `score < 0.75` (umbral sin calibrar contra uso real todavía — ajustar si en producción deja pasar FAQs que no aplican o descarta FAQs válidas). El keyword-match viejo (`searchFaqs`, `getFaqsByProducto` en `knowledge-base/faqs.ts`) se borró por completo — quedó sin ningún caller una vez reemplazado; `getAllFaqs()` se mantiene, ahora solo la usa el script de migración.
- `client.ts` (Mongo): se agregó `closeMongo()` — necesario para que el script de migración (y otros scripts de un solo uso) puedan cerrar la conexión y dejar que el proceso termine solo; el bot en producción nunca la llama.

**Probado end-to-end en producción (2026-08-06)**: corrida real de `npm run migrate:faqs` contra `DanielSoporte` (16/16 FAQs embebidas e insertadas, índice quedó `READY` casi al instante). Prueba de similitud real: la consulta *"no logro que Isabella me proponga horarios para juntarme con un cliente"* (sin compartir ninguna palabra clave con la FAQ) encontró correctamente *"¿Cómo agenda una cita Isabella con un lead?"* como resultado con más score (0.79) — confirma que es similarity search real, no keyword-match disfrazado.

Type-check limpio, 44/44 tests verdes (search-faqs.test.ts reescrito con mocks de `embedText`/`searchFaqsBySimilarity` en vez de llamar la API real).

**Nota técnica**: la migración se corrió desde esta máquina usando el workaround de DNS-over-HTTPS ya documentado (esta máquina específica no resuelve `mongodb+srv://` directo) — no hizo falta tocar `client.ts` ni el código de producción para eso, solo se sobreescribió `MONGODB_URI` en el shell al invocar el script puntualmente. En producción (Coolify) `mongodb+srv://` resuelve normal.

**Retest en vivo (2026-08-06): 3 hallazgos, uno de ellos un bug real de calibración ya arreglado.**

1. **Bug real, arreglado y confirmado en vivo — asimetría entre el texto embebido de la consulta y el de la FAQ.** El modelo llamó a `buscar_faqs` con `query: "no me propone horarios para juntarme con un cliente"` y `producto: "Isabella"` — omitiendo "Isabella" del texto porque ya lo mandó separado como filtro. Pero el texto guardado de cada FAQ sí menciona el producto (la pregunta dice "...Isabella..."), así que esa asimetría le restaba score real a un match correcto (0.72 en vez de 0.77) sin que el match fuera peor semánticamente — quedó justo por debajo del umbral (0.75) y Daniel dijo "no encontré nada". Confirmado con el log de debug agregado esta sesión (`DEBUG buscar_faqs`, ver `search-faqs.ts`). Fix: si viene `producto`, se antepone al texto que se embebe (`"Isabella: no me propone..."` en vez de solo la consulta) — el match subió a 0.77. De paso, se bajó el umbral de 0.75 a 0.72 (con margen: una consulta irrelevante de prueba, "cual es el clima en Guatemala", no pasó de 0.68 incluso con el mismo prefijo de producto). Type-check limpio, 44/44 tests verdes. **Reprobado en vivo (2026-08-06): confirmado funcionando** — mismo mensaje, los 5 resultados de Isabella pasaron el umbral (scores 0.72-0.79), y Daniel respondió con la info correcta de las dos FAQs relevantes (calendario + guion de ventas). Logging `DEBUG buscar_faqs` (temporal) ya removido, cumplió su propósito.

2. **Bug de infra real, arreglado (2026-08-06) — cold-start de Mongo en cada redeploy, no un blip aislado.** Se repitió **dos veces seguidas** (una por cada redeploy de esta sesión): el primer mensaje enviado después de arrancar el contenedor fallaba con `MongoServerSelectionError: Server selection timed out after 30000 ms` — el driver no llegaba a descubrir el primary del replica set a tiempo en un contenedor recién arrancado (en un intento, un host aparecía `"Unknown"`; en el otro, dos de los tres). Esto tumbaba todo `askDaniel()` (no solo la FAQ) y disparaba la auto-escalación de emergencia con datos genéricos (tickets `#3141988009` y `#3142044102`). El segundo mensaje de cada sesión, sin cambios de código, conectaba bien — confirma que era timing de arranque, no una falla persistente de red/credenciales. Fix, dos capas:
   1. `bot.ts`: **calentamiento de Mongo** (`await getDb()`) antes de `app.start()` — mismo patrón que ya existía para el ping de Redis — para que el costo de la primera conexión lo pague el arranque del contenedor, no el primer cliente real. Si igual falla, no aborta el arranque (sigue el reintento ya existente en el próximo mensaje).
   2. `client.ts`: `serverSelectionTimeoutMS` subido de 30s (default) a 45s, margen extra.
   
   Type-check limpio, 44/44 tests verdes. **Confirmado en vivo (2026-08-06)**: el log del redeploy siguiente mostró `"Mongo conectado (calentamiento ok)"` antes de `"⚡️ Daniel está corriendo"`, y el primer mensaje real de esa sesión conectó sin problema.

3. **Bug de config de Slack — HECHO (2026-08-06).** El fallback de auto-escalación intenta buscar el nombre real del cliente vía `client.users.info()` y fallaba con `missing_scope` (faltaba `users:read`). Jorge agregó el scope en OAuth & Permissions y reinstaló la app — pendiente de confirmar en la próxima auto-escalación real que ya trae el nombre bien.

**Los 3 hallazgos de esta sesión quedaron confirmados en vivo y deployados.** Único pendiente real de esta rama de trabajo: migrar `customers.json` a una colección Mongo plana (sin vectores), en algún momento futuro.

## Hallazgo mayor (2026-08-04, sesión noche): instancia fantasma respondiendo en paralelo a producción

Se retomó el diagnóstico del bug de `#escalacion` (punto 0 abajo) dándole a Claude Code acceso directo a la VPS vía la terminal web de hPanel (Hostinger) — la de Coolify sigue rota ("Terminal websocket connection lost"), esta sí funcionó.

**Contenedor duplicado descartado para esta VPS**: `docker ps`/`docker ps -a` mostró un solo contenedor de `daniel-agent`, y `docker exec ... ps aux` adentro mostró un solo proceso `node dist/slack.js`. La teoría del contenedor huérfano en *esta* VPS específicamente queda descartada.

**Pero aparecido un bug real distinto, y más grave, durante una prueba en vivo**: en una conversación de escalación por Slack, el turno 3 (el cliente contesta "urgente") volvió una respuesta que repetía preguntas ya respondidas (nombre, email, producto, descripción) como si la conversación arrancara de cero — a pesar de que `ticket_drafts` en Mongo tenía todos esos datos bien guardados. Se investigó a fondo:
- El log completo del contenedor (`docker logs`, sin recortar) y dos dumps directos a Mongo (`chat_histories`/`ticket_drafts` del `slackUserId` de la prueba) confirmaron que **ese turno 3 nunca tocó ni el log ni la base de producción** — ni un registro humano, ni de IA, ni cambios al draft. Cero rastro, dos veces, con tiempo de sobra entre medio (no era timing).
- **Prueba decisiva**: se hizo un test en tiempo real nuevo, y luego se **paró el contenedor de producción** (`docker stop`) y se mandó otro mensaje de prueba — **Daniel respondió igual, con el contenedor real apagado.**
- Esto confirma que **hay (o había) otro proceso, en otro lugar, conectado con las mismas credenciales reales de Slack** (`SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN`), contestando en paralelo. Se descartó como causa: la Mac de Jorge (sin proceso `node` de Daniel corriendo), la máquina Windows (apagada), un segundo recurso "Application" en Coolify (solo hay uno), un segundo contenedor Docker, y un segundo proceso Node dentro del mismo contenedor.
- Hipótesis líder, sin confirmar todavía: alguien del equipo (iniciativa RedTec/dogfooding) tiene un clone del repo con el `.env` real cargado y corrió/dejó corriendo `npm run dev:slack` en su máquina — probablemente sin `MONGODB_DB_NAME` configurado (cae al default `daniel`, separado de `DanielSoporte` de producción), lo cual explicaría por qué esa instancia respondía sin memoria alguna (su propia base, vacía) y por qué no deja rastro en la base de producción que sí auditamos.
- **Nota aparte, no relacionada con el fantasma**: durante esta sesión también se vio un restart real del contenedor (`SIGTERM`/`Cerrando Daniel...` en el log, sin que nadie tocara Coolify) — resultó ser causado por un `apt update && apt upgrade` corrido directo en la VPS (probablemente reinició el daemon de Docker o pidió reinicio del sistema). No es un problema recurrente de la app, se descarta como pista.

**Acción tomada para intentar cortarle el paso al fantasma (en curso, sin confirmar el resultado todavía)**: se rotaron las credenciales de Slack —
- **App-Level Token (`xapp-...`, el de Socket Mode)**: se regeneró y sí cambió. Importante para este fix porque **la conexión de Socket Mode (recibir eventos) depende del App Token, no del Bot Token** — si el fantasma tenía el viejo, debería desconectarse al invalidarse.
- **Bot Token (`xoxb-...`)**: intentado reinstalar la app vía "Install App" → "Reinstall to Workspace", pero **el valor no cambió** — sospecha de que Slack no fuerza un token nuevo si los scopes no cambian y no se desinstala primero. Se le indicó a Jorge desinstalar del todo antes de reinstalar para forzar un valor nuevo, pero según lo último reportado el Bot Token sigue siendo el mismo. No debería bloquear el test (lo que corta al fantasma es el App Token, no el Bot Token), pero queda como cabo suelto a entender si hace falta rotar el Bot Token de verdad más adelante.
- Ambos valores (el App Token nuevo + el Bot Token sin cambios) ya están cargados en Coolify, y se hizo **Redeploy** (contenedor nuevo, ver abajo). **Pendiente**: mandar un mensaje de prueba post-redeploy y confirmar si el fantasma dejó de responder — resultado todavía no reportado por Jorge al momento de escribir esto.
- Si el fantasma sigue respondiendo igual después de esto, la teoría de "proceso con `.env` viejo" queda descartada, y el siguiente paso sería revisar en el admin de Slack si hay más de una app instalada en el workspace, o un Workflow Builder automatizado respondiendo.

**Bug de código real encontrado de paso — ARREGLADO (2026-08-05)**: al inspeccionar `chat_histories` directo en Mongo durante esta investigación, se confirmó que tenía mensajes de pruebas viejas completamente distintas mezcladas (otro cliente ficticio, otro producto) que nunca se limpiaron. Causa: `daniel.ts` limpiaba `ticketDraft` cuando detectaba `isNewSession`, pero **nunca llamaba a `clearHistory()` en ese mismo caso** — solo se limpiaba el historial cuando se creaba un ticket con éxito. Esto significaba que mensajes de una "sesión" ya expirada (+1h sin actividad) seguían viviendo en Mongo y **volvían a filtrarse en el contexto del modelo tan pronto la sesión dejaba de ser "nueva"** (desde el segundo mensaje de la siguiente sesión en adelante). Fix: `clearHistory(slackUserId)` agregado junto a `clearTicketDraft(slackUserId)` en la rama `isNewSession` de `daniel.ts`. Cuidado no obvio al implementarlo: no se puede meter en el mismo `Promise.all` que ya corre `appendMessage` — `clearHistory` borra el documento entero, así que si corriera en paralelo con (o después de) `appendMessage` podía borrarse el mensaje recién guardado en vez de solo lo viejo. Se separó en dos pasos: primero `await` de la limpieza (solo si `isNewSession`), después el `Promise.all` de `appendMessage`+`extractTicketFields`. Type-check limpio, 37/37 tests verdes. **Pendiente**: probar en vivo (todavía no reprobado en Slack).

## Retest en vivo (2026-08-05, sesión tarde/noche): fantasma parece muerto, aviso a #escalacion funciona, pero bug nuevo encontrado (arreglado)

Tras rotar los tokens de Slack (ver "Hallazgo mayor" arriba), se hicieron 2 tests en vivo por DM (no por canal — importante: en DM el bot responde sin necesidad de mención, `message-handler.ts` lo detecta por `channel_type === "im"`):

- **Test 1 (mensaje único)**: una sola respuesta, sin duplicados — **el fantasma parece haber quedado desconectado** al rotar el App Token (Socket Mode). Sin confirmación 100% definitiva (un solo test), pero buena señal.
- **Test 2 (multi-turno con escalación)**: el ticket se creó solo (`#3141838626`) apenas se completaron los 6 campos requeridos (el extractor infirió `urgencia`/`tipoSolicitud` de la pregunta inicial sin que el cliente los mencionara explícitamente) — comportamiento esperado del diseño ("apenas tengas todos los datos, escalá"), no un bug. **El aviso llegó a `#escalacion` completo y bien formado** (cliente, email, producto, tipo, resumen, qué se intentó) — el bug histórico de la notificación faltante (puntos 0/2 de pendientes) parece resuelto, probablemente porque la causa real era el fantasma todo este tiempo.

**Bug nuevo encontrado y arreglado — `""` (string vacío) tratado como valor presente en `mergeTicketFields`**: al seguir la conversación de Test 2 con un tema nuevo para la misma persona (mismo `slackUserId`, sin pasar 1h), Daniel volvió a pedir el nombre completo aunque ya estaba guardado en el perfil (`users`, confirmado por query directa a Mongo vía el workaround DNS-over-HTTPS documentado más abajo — el MCP de Mongo sigue sin funcionar desde esta máquina). Causa raíz confirmada con los documentos reales:
- `users.nombreCliente` = `"Ana López"` (correcto).
- `ticket_drafts.nombreCliente` = `""` (string vacío, no `undefined`).

`extractTicketFields` devolvió `nombreCliente: ""` en vez de omitir el campo — y el prompt de extracción (`extract-ticket-fields.ts`) incluso lo invitaba: *"si un dato no aparece con claridad, dejalo vacío"*. Como `mergeTicketFields` solo chequeaba `value !== undefined` para decidir qué fuente gana, el `""` del borrador (mayor prioridad) tapaba el nombre correcto del perfil (menor prioridad) — y como `""` es falsy, `findMissingFields` lo detectaba igual como "falta", así que Daniel repreguntaba un dato que ya tenía. Fix de dos capas:
1. `mergeTicketFields` (`agent/tools/ticket-fields.ts`): nueva función `hasValue()` que trata `""` igual que `undefined` (ausente), para no depender de que el LLM de extracción se porte bien.
2. `extract-ticket-fields.ts`: prompt reescrito de "dejalo vacío" a "OMITÍ el campo por completo... nunca uses un string vacío".

Type-check limpio, 37/37 tests verdes. Deployado (push `57f75a1`, auto-deploy vía Coolify).

**Reprobado en vivo (2026-08-05, mismo día): confirmado funcionando.** Se retomó la misma conversación de Slack (por DM) contestando `Ana Lopez` al pedido de nombre — Daniel creó el ticket de una (`#3141811663`, producto Isabella, problema "Error al guardar los datos al dar de alta un cliente", urgencia Urgente, email correcto), sin repreguntar nada más. Es un ticket nuevo y legítimo (describe un problema concreto y distinto del ticket anterior, no un duplicado sin sentido). **El aviso llegó a `#escalacion` de nuevo, de forma consistente** — confirma que no fue casualidad con el ticket anterior. Nota: como en esta prueba el nombre se dio explícitamente en el mismo turno, no vuelve a poner a prueba el caso exacto de "nombre ya guardado en el perfil, sin repetirlo" — pero confirma que el flujo general quedó desbloqueado.

**Nota técnica (para futuras sesiones en esta máquina)**: el MCP de MongoDB Atlas conectado a Claude Code sigue sin funcionar (connection string inválida/no configurada). El workaround documentado en julio (resolver SRV+TXT vía DNS-over-HTTPS de Cloudflare y armar un connection string no-SRV a mano) se reprobó y **sigue funcionando** — usado para confirmar este bug con datos reales de producción sin depender del panel de Coolify.

**Bug de formato encontrado y arreglado, mismo día (2026-08-05)**: Jorge notó que las respuestas de Daniel mostraban literalmente `**texto**` en vez de negrita en Slack. Causa: el LLM escribe Markdown estándar (GitHub-flavored, `**negrita**`, `[texto](url)`), pero Slack usa su propio formato "mrkdwn" — negrita es `*texto*` (un asterisco) y los links son `<url|texto>`. Nuestro propio código (`notify-escalation.ts`) ya usaba la sintaxis correcta porque lo armamos a mano; el problema era solo en las respuestas generadas por el LLM para el cliente. Fix: `src/channels/slack/format.ts` (`toSlackMrkdwn()`, con test dedicado) convierte `**`/`__` a `*` y `[texto](url)` a `<url|texto>` — aplicado en el único punto por donde pasan esas respuestas (`handleResolvedMessage` en `message-handler.ts`), en vez de depender de que el prompt logre que el modelo escriba mrkdwn nativo de forma confiable. Type-check limpio, 42/42 tests verdes (5 nuevos). Deployado (push `b7c748f`) y **confirmado en vivo (2026-08-05)**: el número de ticket se ve en negrita real en Slack, sin los asteriscos literales.

**Bug más serio encontrado en el mismo retest (2026-08-05): la extracción confundió un nombre de producto con el nombre del cliente, y corrompió el perfil persistente.** Al preguntar "¿qué documentos necesito para dar de alta un cliente en **Sofi**?", Daniel escaló el ticket solo (usando datos ya conocidos del perfil) pero saludó con *"¡Gracias por tu consulta, Sofi!"* — `extractTicketFields` extrajo `nombreCliente: "Sofi"` de la mención al producto, ignorando la instrucción de "solo si el cliente lo dijo explícitamente". Como el borrador extraído tiene prioridad sobre el perfil en `mergeTicketFields`, y "Sofi" no es un string vacío (mi fix anterior de `""` no lo detecta), tapó el nombre real ("Ana López"). Y como el ticket se creó con éxito, `saveCustomerProfile` persistió `nombreCliente="Sofi"` **para siempre** en `users` — confirmado con query directa a Mongo. Reparado el dato en producción (UPDATE puntual devolviéndolo a "Ana López", con chequeo de que el valor previo fuera exactamente "Sofi" antes de tocar nada). Fix de causa raíz, dos capas:
1. `extract-ticket-fields.ts`: descripción del campo `nombreCliente` en el schema de Zod reforzada, aclarando explícitamente que nunca debe ser un nombre de producto.
2. Nueva función pura `esNombreDeProducto()` (mismo archivo, exportada y testeada) — red de seguridad que descarta el `nombreCliente` extraído si coincide exactamente (case-insensitive) con uno de los productos de RedTec, sin depender de que el modelo seguí bien la instrucción del prompt.

Type-check limpio, 47/47 tests verdes (5 nuevos). **Riesgo residual sin resolver**: este guard solo cubre el caso exacto ya visto (nombre de producto). Si la extracción devuelve *otro* valor incorrecto pero plausible (no un nombre de producto), nada lo detecta y podría corromper el perfil igual — no hay validación general de "¿este nombre extraído tiene sentido?". Si vuelve a aparecer un caso así, considerar no persistir el perfil automáticamente sin algún tipo de confirmación, o comparar contra el nombre ya guardado antes de sobrescribir.

**Reprobado en vivo (2026-08-05, mismo día): confirmado funcionando.** Deployado (push `4b95336`). Se repitió la misma pregunta ("...dar de alta un cliente en Sofi") con el mismo `slackUserId` contaminado — esta vez Daniel saludó correctamente como "Ana" (no "Sofi"), creó el ticket `#3141884822` sin problema, y el perfil en `users` se confirmó intacto (`nombreCliente: "Ana López"`) después, vía query directa a Mongo.

## Pendientes / próximos pasos (en orden)

Todo lo bloqueante de sesiones anteriores (fantasma, aviso a `#escalacion`, memoria de Mongo, debounce, KB vectorizada) está **resuelto y confirmado en vivo** — ver el detalle de cada uno en las secciones de arriba (checklist de "Estado actual", "Hallazgo mayor", y los distintos "Retest en vivo"). Lo que queda realmente abierto hoy:

**Evaluación estratégica (2026-08-12)**: `plans/2026-08-12-roadmap-premium-profesional.md` tiene el diagnóstico completo de qué falta para pasar de "v1 que funciona en dogfooding interno" a "producto premium confiable con clientes externos reales" (datos reales de KB/clientes, CI, observabilidad de negocio, staging, segundo canal, etc.), con prioridades y esfuerzo estimado. Los ítems de esa evaluación que ya estaban en esta lista se marcan abajo con referencia cruzada; los que son nuevos se agregaron como puntos 9-11.

1. **La integración realtime (ver "Estado actual" arriba) ya está mergeada a `main` (2026-08-12)** — antes vivía en la rama `feat/redtec-realtime-websocket` y había que traerla explícitamente (`git fetch` + `git checkout feat/redtec-realtime-websocket`); ahora ya no. Sigue **sin deployar/probar en vivo**: falta que RedTec confirme los datos del punto 7. El código es seguro en producción sin esas credenciales (no rompe nada si no están configuradas).

2. **Migrar `customers.json` a Mongo — diseño ya decidido (2026-08-12), falta implementar.** Ya no es solo "colección plana": se decidió fusionar `customers.json` + la colección `users` existente en una sola colección `customers`, clave `email`, para resolver de una vez la falta de un campo `empresa` accesible por `slackUserId` (bloqueaba el gating del Agente Técnico y el futuro mapeo de `tenantId` de RedTec). Diseño completo, schema del documento, plan de migración y qué código cambia en `plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md`. Nota del roadmap (punto 1 de `plans/2026-08-12-roadmap-premium-profesional.md`) sigue vigente: esta migración es solo la parte estructural — falta aparte reemplazar el *contenido* (las 16 FAQs y los 7 clientes son de ejemplo) antes de exponer Daniel a clientes externos reales.

También decidido el mismo día: convención estándar para datos que llegan de sistemas externos (webhook genérico, RedTec realtime, futuros) — colección `<fuente>_raw` con TTL default de 30 días + colección tipada derivada recién cuando el schema se conoce, ver el mismo plan. Acción concreta pendiente de aplicar: `webhook_raw_events` no tiene TTL hoy, hay que agregárselo.

3. **Seguridad, no bloqueante: re-restringir la regla SSH (puerto 22) de la VPS a una IP específica** — quedó abierta a cualquier IP desde que se movió el bot al VPS (2026-07-29/30).

4. **Seguridad, no bloqueante: revisar el checkbox "Use Docker Build Secrets" en Coolify** — sin esto, Coolify hornea todos los secrets de la app (incluido `REDIS_URL`) como `ARG` de Docker durante el build, visibles en el historial de capas de la imagen (ver "Paso 4" arriba). Ver también punto 3 del roadmap (`plans/2026-08-12-roadmap-premium-profesional.md`).

5. **Sin confirmar del todo, baja prioridad: si el fantasma podría reaparecer.** Se rotaron los tokens y no volvió a responder en ningún retest posterior, pero la causa raíz exacta (qué proceso era) nunca se confirmó — solo se descartó indirectamente. Si vuelve a verse una respuesta duplicada o con amnesia total, revisar primero si hay una segunda app/Workflow Builder instalada en el admin de Slack (ver "Hallazgo mayor" arriba).

6. **Calibración del umbral de relevancia de `buscar_faqs` (`MIN_SCORE = 0.72`)** — confirmado con un puñado de pruebas manuales, no con volumen real de uso. Ajustar si en producción se ve que deja pasar FAQs que no aplican o descarta FAQs válidas. Depende de tener tráfico real primero (ver punto 1 del roadmap).

7. **Bloqueante para activar el WebSocket de tiempo real de RedTec (ver "Estado actual" arriba, 2026-08-06): falta que RedTec confirme dos datos.**
   - La URL real del dominio de la plataforma (`REDTEC_PLATFORM_WS_URL` — la guía usa un placeholder).
   - El nombre real de la variable del secreto: la guía de RedTec es inconsistente — el texto dice que es la misma que ya usa el webhook de superadmin (`SUPPORT_AGENT_WEBHOOK_SECRET`), pero el código de ejemplo usa `REDTEC_PLATFORM_WS_SECRET`. Confirmar con RedTec antes de cargar un valor real en Coolify (hoy el código usa `REDTEC_PLATFORM_WS_SECRET`).
   - Una vez confirmados: cargar ambas en Coolify, redeploy, confirmar en logs "Realtime de RedTec conectado", confirmar por query directa a Mongo que `platform_metrics` recibe un doc nuevo cada ~30s, y probar en Slack "¿está funcionando el sistema?" / "¿cómo estuvo en la última hora?".

8. **No bloqueante, para cuando haga falta**: construir el mapeo cliente-de-Slack → `tenantId` de RedTec Realstate y recién ahí exponer una tool de leads/citas sobre `platform_events` (que ya se está llenando desde el 2026-08-06, sin ningún consumidor todavía).

9. **CI — HECHO (2026-08-12).** `.github/workflows/ci.yml` corre `npx tsc --noEmit` y `npm test` (52 tests) en cada push/PR a `main`, sin secrets (los tests ya mockean Mongo/OpenRouter/Monday). Confirmado en local antes de pushear: type-check limpio, 52/52 verdes. Push `37513b3`.

10. **Seguridad, cabo suelto sin cerrar (nuevo, del roadmap): rotación del Bot Token de Slack (`xoxb-...`) quedó a medias durante la investigación del "fantasma" (ver "Hallazgo mayor" arriba)** — el App Token (Socket Mode) sí se roto y cortó al fantasma, pero "Reinstall to Workspace" no generó un Bot Token nuevo. Falta desinstalar la app del todo y reinstalar de cero para forzar un valor nuevo, o confirmar explícitamente que no hace falta.

11. **Madurez operativa faltante (nuevo, del roadmap, no bloqueante para seguir usando Daniel hoy pero sí para escalarlo con confianza)**: cero observabilidad de negocio (no hay forma de ver volumen de tickets/tasa de escalación/tiempo de respuesta sin queries manuales a Mongo) y no existe un ambiente de staging separado de producción — varios bugs serios de este documento (tickets duplicados, el fantasma, datos mezclados entre sesiones) se depuraron en vivo contra Slack/Monday reales. Detalle y opciones de esfuerzo en `plans/2026-08-12-roadmap-premium-profesional.md`, prioridad 1.

12. **Nueva iniciativa diseñada, sin código todavía: "Agente Técnico" para diagnosticar problemas de sistemas n8n de clientes (caso guía: Spectrum).** Idea de Jorge (2026-08-12): un segundo agente de IA, en un repo nuevo y separado (`Agente-Tecnico`), con acceso de solo lectura vía MCP (`n8n-mcp` + `@langchain/mcp-adapters`) a la instancia de n8n de un cliente, que vive en Slack junto a Daniel en un **canal compartido** visible para humanos. Flujo: Daniel menciona al agente técnico en ese canal describiendo el problema reportado por el cliente → el agente técnico audita n8n (workflows/ejecuciones/errores) y responde en el hilo → Daniel extrae el diagnóstico de forma estructurada y le contesta al cliente en la conversación original. Diseño completo (tools nuevas, esquema de Mongo para correlacionar la respuesta por `thread_ts`, estructura del repo nuevo, fases, estimación ~9-12 días) en `plans/2026-08-12-agente-tecnico-n8n-spectrum.md`. **Nada de esto está construido** — el próximo paso al retomar es empezar por el lado Daniel (tool `consultar_agente_tecnico` + persistencia del handoff), que no depende de que el repo del agente técnico exista todavía.

13. **Definir el schema real del webhook (`POST /webhook/internal`, ver arriba) una vez que lleguen los primeros datos reales del compañero/agente que los va a mandar** — hoy solo se capturan crudos (log + `webhook_raw_events` en Mongo) a propósito, sin ningún procesamiento. Falta decidir qué hacer con esos datos (¿alimentan una tool nueva? ¿un canal nuevo? ¿se re-emiten a otro lado?) una vez que se conozca la estructura y el propósito real.

14. **Conseguir un dominio propio para HTTPS real en el webhook** — hoy corre en `http://` sobre el dominio `*.sslip.io` autogenerado por Coolify porque Let's Encrypt rate-limitea esos dominios compartidos (ver arriba). Mientras el tráfico sea interno y de bajo volumen no es bloqueante, pero si esto se vuelve permanente o crece en sensibilidad de los datos, conviene apuntar un subdominio propio (ej. de `garooinc.com`) al VPS.

## Referencia rápida del stack

Node.js + TypeScript · Slack vía `@slack/bolt` (Socket Mode) · Webhook HTTP genérico (`node:http` nativo) para datos internos · Debounce/cola de mensajes con Redis + BullMQ · Orquestación con LangChain.js · LLM vía OpenRouter (`deepseek/deepseek-v4-pro`, fijo en código) · Persistencia en MongoDB Atlas (chat/tickets/perfiles + KB de FAQs vectorizada, `openai/text-embedding-3-small` vía OpenRouter, + eventos crudos del webhook + métricas/eventos del WebSocket de RedTec) · WebSocket de tiempo real de RedTec Realstate vía `socket.io-client` (mergeado en `main`, sin deployar todavía, ver Pendientes) · Escalación vía API GraphQL de Monday.com (board `5101177200`) · Logging con `pino` · Tests con Vitest (52 tests, 14 archivos) · Test E2E automatizado (`npm run test:e2e`).

**Nota**: Express estaba en el plan original del stack pero **todavía no se instaló ni se usa** — el primer servidor HTTP real del proyecto (el webhook de arriba, 2026-08-11) se hizo con `node:http` nativo a propósito, porque solo necesitaba una ruta simple; Express sigue pendiente para cuando llegue el widget web (canal #2 del roadmap), que va a necesitar más rutas/middleware.

Detalle completo de cada decisión y por qué se tomó: `NOTAS-INICIALES.md`.
