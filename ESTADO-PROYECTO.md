# Estado del proyecto — Daniel Agent

Última actualización: 2026-08-04

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
- [x] **Fix: `auto-escalate.ts` ahora usa el `ticket_draft` real (2026-07-31, commit `969b292`)**: bug encontrado en prueba en vivo (turno del email). Antes, la auto-escalación siempre creaba el ticket con `producto="Otro"`, `urgencia="Urgente"` y `resumen=texto_crudo_del_último_mensaje`, ignorando por completo los datos que `extractTicketFields` había acumulado en `ticket_drafts` durante la conversación. Fix: `escalateUnresolvedConversation` ahora lee el `ticket_draft` de Mongo y hace `mergeTicketFields(draft, perfil)` antes de armar el ticket. Solo cae a los fallbacks genéricos si el draft no tiene ese campo. Agrega `auto-escalate.test.ts` con 6 tests (35 tests totales, todos verdes).
- [x] **Script de test E2E automatizado (2026-07-31, `src/test-e2e.ts`)**: `npm run test:e2e` corre un flujo completo de conversación multi-turno (5 turnos, datos dados de a uno) con LLM real (OpenRouter) y Monday.com real, usando un in-memory store en vez de MongoDB. Crea un ticket de prueba, verifica sus campos en Monday y lo borra al terminar. No requiere MONGODB_URI ni intervención manual. **Resultado: 9/9 checks pasaron.**
- [x] **Fix: `clearHistory` diferido tras respuesta final y reintento de conexión en `client.ts` (2026-07-31)**:
  - **Historial limpio (9/9 checks E2E)**: Se corrigió el orden de limpieza. `clearHistory` ahora se ejecuta *después* de guardar la respuesta final de la IA en `chat_histories`, asegurando que `chat_histories` quede en 0 mensajes tras una escalación exitosa.
  - **Reintento de conexión MongoDB**: `client.ts` ahora resetea `dbPromise = undefined` en el `catch` si falla la conexión inicial o la creación de índices, permitiendo reintentar la conexión en llamadas posteriores si hubo una falla de red o DNS temporal.
- [~] **Retest en vivo en Slack (2026-07-31, sesión noche): ticket creado en Monday, pero el aviso a `#escalacion` sigue sin llegar.** Ana López (cliente de prueba) escaló un caso urgente por Slack; Daniel creó el ticket real en Monday (id `3130442122`) sin problema. La notificación a `#escalacion` (`notify-escalation.ts`) no llegó — mismo síntoma que la sesión anterior, ya sin resolver.
  - **Descartado como causa**: el nombre del canal. Jorge confirmó que el canal se llama exactamente `escalacion` (coincide con el default de `SLACK_ESCALATION_CHANNEL` en `env.ts`).
  - **Intentado y no resolvió nada**: reinstalar la app en api.slack.com y actualizar el `SLACK_BOT_TOKEN` en Coolify con el token nuevo. Esto solo regenera el token — **no agrega scopes que no estuvieran ya en la lista de OAuth & Permissions**, así que si la causa es un `missing_scope`, reinstalar sin tocar los scopes no cambia nada.
  - **Diagnóstico narrowed down, esperando 3 datos de Jorge para confirmar cuál de las tres es**:
    1. El log exacto en Coolify de la línea `"No se pudo notificar el canal de escalación en Slack"` para el ticket `3130442122` (trae el código de error real de la API de Slack: `missing_scope`, `not_in_channel`, `channel_not_found`, etc. — el error se atrapa con `.catch()` en `escalate-to-monday.ts`/`auto-escalate.ts`, así que nunca crashea, solo queda logueado como warning).
    2. La lista actual de **Bot Token Scopes** en OAuth & Permissions — necesita como mínimo `channels:read`, `groups:read`, `chat:write`, y `chat:write.public` si `escalacion` es público y el bot no está invitado.
    3. Confirmar que `@Daniel-Soporte` esté invitado al canal `escalacion` (`/invite @Daniel-Soporte` si no lo está) — sin esto, `chat.postMessage` puede fallar con `not_in_channel` aunque los scopes estén bien.

**Nota de red de esta máquina**: el fetch nativo de Node (`undici`) tiene timeouts intermitentes (`ETIMEDOUT`) contra hosts externos (pasó con `registry.npmjs.org`, `api.monday.com` y hasta `openrouter.ai`) que `curl` no sufre — parece un problema de resolución/preferencia IPv6 en esta máquina. Si el bot corriendo en otra máquina tiene llamadas que cuelgan o tardan mucho, probar arrancándolo con `NODE_OPTIONS="--dns-result-order=ipv4first" npm run dev:slack` antes de asumir que es un bug de la app.

**Conector MCP de Monday.com disponible (sin usar todavía)**: apareció un conector `claude.ai monday.com` (requiere autenticar corriendo `/mcp` y eligiéndolo de la lista) que no existía cuando se definió el stack original. La integración ya construida (`src/integrations/monday/`) usa la API GraphQL directa y está probada — el MCP no la reemplazó, pero queda como opción para inspeccionar el tablero interactivamente sin escribir queries a mano.
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

### Paso 5 (después del debounce) — KB vectorizada en Mongo Atlas
- Todavía sin diseñar en detalle. Alcance acordado: migrar los 16 FAQs de `data/faqs.json` y los 7 clientes de `data/customers.json` a una colección con embeddings + Atlas Vector Search, reemplazando el keyword-match actual de `knowledge-base/faqs.ts` por similarity search. Requiere elegir modelo de embeddings (vía OpenRouter o directo) y crear el Vector Search Index en Atlas. Diseñar cuando se retome este punto.

## Pendientes / próximos pasos (en orden)

0. **(Bloqueante #1, en curso) Diagnosticar por qué el aviso a `#escalacion` no llega, aunque el ticket sí se crea en Monday.**
   - Confirmado en la última prueba en vivo (2026-07-31): ticket `3130442122` creado correctamente en Monday, pero cero aviso en `#escalacion`. Ya se descartó el nombre del canal (es `escalacion`, coincide con el código) y reinstalar la app de Slack + token nuevo en Coolify **no lo arregló**.
   - **Esperando 3 datos de Jorge para cerrarlo** (ver detalle en "Estado actual" arriba):
     1. El log de Coolify con el error real de Slack para el ticket `3130442122` (`missing_scope` / `not_in_channel` / `channel_not_found`, etc.)
     2. La lista de **Bot Token Scopes** actual en OAuth & Permissions (necesita `channels:read`, `groups:read`, `chat:write`, y `chat:write.public` si el canal es público y el bot no está invitado).
     3. Confirmar que `@Daniel-Soporte` esté invitado al canal `escalacion`.
   - **Hipótesis más probable dado que reinstalar el token no ayudó**: falta un scope que nunca se agregó a la lista de OAuth & Permissions (reinstalar solo regenera el token con los scopes que ya estaban, no agrega nuevos).

1. **Diagnosticar y confirmar MongoDB en producción (Coolify) — causa raíz original de la amnesia del agente, todavía sin cerrar del todo.**
   - **Síntoma observado (prueba en vivo 2026-07-31, sesión tarde)**: Daniel no recordaba nada entre mensajes del mismo usuario. El código local (test E2E con in-memory store) funciona perfectamente, así que el problema era de infraestructura, no de lógica.
   - **En curso (sesión noche 2026-07-31)**: se pidió a Jorge revisar directo en MongoDB (vía terminal/mongosh) qué hay ahora mismo en `chat_histories`/`ticket_drafts`/`users`, para determinar si los mensajes no se están guardando o si se están borrando por algún motivo — **resultado todavía no reportado**.
   - Nota: el ticket `3130442122` de la prueba más reciente sí se creó con el flujo normal (no fue una auto-escalación por error), lo cual es una señal indirecta de que el agente venía funcionando en ese turno — pero no reemplaza confirmar el estado real de las 3 colecciones en Mongo.
   - **Cómo verificar si hace falta repetir**: entrar a Coolify → Application → Environment Variables y confirmar que `MONGODB_URI` existe con exactamente ese nombre y contiene el connection string de Atlas (`mongodb+srv://...`). También revisar los logs de Coolify buscando cualquier warn/error de MongoDB.

2. **Reprobar en vivo el flujo completo una vez que MongoDB y el aviso a `#escalacion` estén confirmados** — el test E2E pasó 9/9 localmente con in-memory store. Repetir el guión de varios turnos en Slack y verificar:
   - (a) ticket con producto/resumen/email reales (no genéricos)
   - (b) no repregunta datos ya dados
   - (c) aviso en `#escalacion` llega (todavía sin confirmar — ver punto 0)
   - (d) perfil guardado en `users` para la próxima sesión

3. **Mover el bot a un VPS — HECHO (2026-07-29/30)** (ver detalles completos en la versión anterior de este archivo — sin cambios).
   - **Pendiente (seguridad, no bloqueante)**: re-restringir la regla SSH (puerto 22) a una IP específica.

4. **Debounce/cola de mensajes con Redis — HECHO y confirmado en vivo (2026-08-03/04).** Ver el detalle completo (4 bugs de infra/código encontrados y arreglados, más el diagnóstico final de que "3 respuestas separadas" era timing de la prueba manual, no un bug) en "Paso 4 — Probar en vivo" dentro de "Plan pendiente" más arriba en este archivo. `DEBOUNCE_MS = 10000` en producción, logging de debug temporal ya removido de los 3 archivos donde se había agregado.
   - Después de esto: KB vectorizada en Mongo Atlas (Paso 5, migrando el contenido ya existente de `faqs.json`/`customers.json`, no contenido nuevo — diseño todavía sin definir).

## Referencia rápida del stack

Node.js + TypeScript · Slack vía `@slack/bolt` (Socket Mode) · Orquestación con LangChain.js · LLM vía OpenRouter (`deepseek/deepseek-v4-pro`, fijo en código) · Persistencia en MongoDB Atlas · Escalación vía API GraphQL de Monday.com (board `5101177200`) · Logging con `pino` · Tests con Vitest (35 tests, 9 archivos) · Test E2E automatizado (`npm run test:e2e`).

**Nota**: Express estaba en el plan original del stack pero **todavía no se instaló ni se usa** — no hizo falta porque todo el tráfico entra por Slack Socket Mode, que no necesita servidor HTTP. Va a hacer falta recién con el widget web (canal #2 del roadmap).

Detalle completo de cada decisión y por qué se tomó: `NOTAS-INICIALES.md`.
