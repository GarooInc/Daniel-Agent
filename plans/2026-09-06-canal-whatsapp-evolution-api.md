# Canal nuevo: WhatsApp vía Evolution API (grupos, Daniel mencionado)

## Contexto

Retoma el pendiente #24 de `ESTADO-PROYECTO.md` ("Nuevo canal: Daniel escuchando y mandando mensajes en grupos de WhatsApp"). Jorge le mandó 4 preguntas a Fernando Ortiz (RedTec) el 2026-09-05 para no inventar el contrato de un sistema externo (mismo criterio que ya costó bugs reales acá, ver puntos 13/23 de `ESTADO-PROYECTO.md`). Fernando respondió el 2026-09-06 por Slack, confirmando la hipótesis que ya estaba documentada como no verificada.

**Las 4 preguntas de Jorge y la respuesta real de Fernando:**

1. **¿Con qué corren esto?** Confirmado: **Evolution API self-hosted sobre Baileys**. No hay nada distinto por tenant salvo instancias dedicadas para clientes específicos (no es el caso general).
2. **URL + API key + nombre de instancia** (credenciales reales, no se pueden inventar):
   - Server URL: `https://send.redtecsystems.com`
   - API Key: `cb3a8466c2359cca6f9169546bd8b8588f6bc796ce273e6b`
   - Instancia: `RedtecBot`
   - Definido hoy en `api-mainrealstate/.env` (líneas 65-69, repo `redtec.ai-realstate` — **no es este repo**, es el sistema de Fernando).
3. **¿WebSocket en vivo o solo webhooks?** WebSocket en vivo ya prendido, es el camino principal para la instancia compartida `RedtecBot`. Socket.io contra `send.redtecsystems.com/RedtecBot`, eventos `messages.upsert`, `groups.upsert`, `group.update`, con reconexión automática y backoff. Los webhooks HTTP son solo para tenants con instancia dedicada propia (no es el caso general).
4. **¿Daniel ve todos los grupos, o hay que armar una lista por cliente?** Ambas cosas, en capas distintas:
   - Hay una tabla central **`ra_whatsapp_groups`** (del lado del sistema de Fernando, no de este repo) que asocia `group_jid` (termina en `@g.us`) → `tenant_id` + nombre + propósito. Se auto-sincroniza sola en cada reconexión del WebSocket (llama a la API de Evolution para traer todos los grupos del número, asigna propósito por defecto por regex de nombre: frontend/infra/commercial).
   - Daniel (el número compartido) ve automáticamente todos los grupos que pasan por ahí — se sincronizan solos.
   - **Pero el mapeo de "a qué cliente pertenece cada grupo" sigue siendo manual** — alguien tiene que revisar esa tabla y asignarle `tenant_id` a cada grupo nuevo (salvo los que ya matchean la regla automática por nombre).

Fernando también pasó la lista actual de grupos que ve el número compartido (jid → nombre visible), ver "Datos de referencia" abajo.

## Decisión de alcance para esta primera pasada (a confirmar con Jorge antes de codear)

Mismo principio ya aplicado en `plans/2026-08-06-redtec-realtime-websocket.md`: **conectar el socket, pero no exponer nada al agente hasta tener un mapeo confiable cliente↔grupo**. Acá el riesgo es peor que en el caso de realtime (que era solo lectura de métricas): un mapeo mal hecho en WhatsApp puede hacer que Daniel le conteste a un cliente con datos/tono de otro, o intervenga en un grupo interno de RedTec (`RedTec Dev`, `Front End - Garoo`, `RedtecAi` aparecen en la lista de Fernando — no son grupos de cliente).

Por eso, alcance propuesto para la primera pasada:
- Daniel se conecta como cliente Socket.io de la instancia compartida y **escucha** `messages.upsert` en todos los grupos.
- Responde **solo si lo mencionan** (`@Daniel` o el número del bot dentro del grupo) — mismo criterio que Slack (`<@BOT_USER_ID>` en canales, no en DMs) y que ya confirmó Jorge (punto 24, "(d, mitad)").
- Antes de invocar `askDaniel()`, resuelve `group_jid → empresa` contra una tabla **propia de este repo** (no `ra_whatsapp_groups`, ver "Puntos abiertos" #1). Si el grupo no está mapeado a ningún cliente, **no responde y solo loguea** (mismo espíritu que "nunca prometerle al cliente algo que no se hizo": mejor silencio que contestarle a un grupo interno o a un cliente equivocado).

## Puntos abiertos que hay que confirmar antes de escribir código (no asumir)

1. **[CERRADO 2026-09-06] ¿De dónde sale el mapeo `group_jid → empresa` que usa Daniel?** Jorge confirmó: tabla propia **`whatsapp_groups`** en el Postgres de Daniel (mismo patrón que `tech_agents`), no `ra_whatsapp_groups`. Implementado — ver `integrations/postgres/whatsapp-groups.ts`.
2. **[CASI CERRADO 2026-09-06, sin probar de punta a punta] ¿Puede Daniel conectarse como un segundo cliente Socket.io a la misma instancia sin pisar la conexión que ya usa `api-mainrealstate`?** Confirmado por `GET /instance/fetchInstances` (real, contra `send.redtecsystems.com`, con permiso explícito de Jorge para un test de solo lectura): la instancia `RedtecBot` tiene su websocket habilitado a nivel de servidor (`Websocket.enabled: true`, eventos `MESSAGES_UPSERT`/`GROUPS_UPSERT`/`GROUP_UPDATE`) — es una config de broadcast del lado de Evolution API, no una sesión exclusiva de un solo cliente, así que un segundo listener Socket.io no debería desconectar al primero. **No probado empíricamente** (abrir el socket de verdad para confirmarlo es una conexión persistente contra la instancia real, fuera del alcance del permiso de "solo GET" — falta ese paso antes de habilitar en producción).
3. **[EN PROGRESO 2026-09-07] Contrato exacto de envío** (para responder, no solo escuchar): la hipótesis ya documentada en el punto 24 es `POST /message/sendText/{instance}` con `{ number: groupJid, text }`. **Fernando dio luz verde para probar contra el grupo interno "RedTec Dev"** (`120363392107150448@g.us` — ya identificado como interno en la clasificación del punto 24, sin cambios ahí). Falta correr la prueba real (curl de envío + confirmar el formato de `mentionedJid` con un mensaje real de mención) antes de dar esto por cerrado.
4. **[CASI CERRADO 2026-09-06] Formato exacto de `mentionedJid` / cómo detectar que mencionaron a Daniel.** El JID propio del bot (equivalente al `BOT_USER_ID` de Slack) es `13322311881@s.whatsapp.net` (`ownerJid` de la instancia `RedtecBot`, confirmado por `GET /instance/fetchInstances`). **Falta confirmar** que ese mismo JID es el que aparece en `contextInfo.mentionedJid` cuando alguien menciona al bot dentro de un grupo real (solo se ve con un mensaje real, no con un GET) — hasta entonces, cargar `WHATSAPP_BOT_JID=13322311881@s.whatsapp.net` es la mejor hipótesis disponible, no una confirmación de punta a punta.

Mientras el punto 3 no esté confirmado, el código se implementa igual que el de realtime: **arranca sin romper nada si `WHATSAPP_EVOLUTION_URL`/`WHATSAPP_EVOLUTION_API_KEY` no están seteadas** (loguea deshabilitado, resto del bot sigue andando), para poder mergear ya y activar la conexión real en cuanto quede confirmado.

**[RESUELTO EN VIVO 2026-09-07] Primer intento real de conexión (credenciales reales, grupo de prueba "RedTec Dev") falló con `403 "apiKey is required"`.** Causa: se mandaba la key vía `auth: {apikey}` (mecanismo interno de Socket.IO, solo visible del lado del servidor después del handshake de engine.io) — Evolution API la valida en el handshake HTTP mismo. Corregido (commit `9fca1da`): la key va en la `query` string de la conexión. **Confirmado en logs de producción tras el redeploy: `"WhatsApp (Evolution API) conectado"`.** Punto abierto #2 (¿pisa la conexión de `api-mainrealstate`?) queda confirmado del todo: la conexión de Daniel se sostuvo sin cortar nada del otro lado.

**[EN CURSO 2026-09-07] Conectado pero sin eventos — se descartaron 2 hipótesis, encontrada la causa real de fondo.** Con la conexión sana, cero eventos llegaban nunca (ni con "RedTec Dev" ni con "Soporte Live", el grupo que el propio Fernando señaló para la prueba en vivo). Se corrigió el nombre del evento (`MESSAGES_UPSERT`, mayúsculas — confirmado contra `fetchInstances`, commit `4e68cc4`) y se probó conectar al namespace raíz en vez de `/RedtecBot` (Fernando confirmó que la instalación está en modo "global": todos los eventos de todas las instancias llegan a un único namespace, con un campo `instance` para filtrar — commit `76ba4c9`, con un listener `onAny()` temporal para loguear cualquier evento crudo sin seguir adivinando el nombre/forma). **Seguía en cero incluso con `onAny()` (que captura literalmente cualquier evento de Socket.IO)** — esto descarta que fuera un problema de nombre de evento o de namespace. **Causa real, confirmada por Fernando: no es Socket.IO del todo — es un WebSocket puro (`wss://`).** `socket.io-client` habla el protocolo de Socket.IO (que corre sobre Engine.IO, no WebSocket puro) — por eso el "connect" se disparaba sin error (la conexión de red/HTTP subyacente se establece igual) pero ningún mensaje real de Evolution API llegaba nunca en un formato que Socket.IO reconociera como evento. **Pendiente**: Fernando tiene que pasar el fragmento de conexión real de `api-mainrealstate` (URL/path exacto, cómo se manda la api key en un WS puro, y un ejemplo real del JSON que llega) — recién con eso se puede reescribir `integrations/evolution-api/client.ts` para usar un WebSocket nativo en vez de `socket.io-client`, sin adivinar una cuarta vez.

## Diseño

Sigue el mismo principio ya aplicado en realtime: nada de estado solo en memoria de proceso, todo lo que llega se persiste antes de decidir qué hacer con eso (sobrevive redeploys de Coolify).

```
src/integrations/evolution-api/
  client.ts           # conexión socket.io singleton a `${WHATSAPP_EVOLUTION_URL}/RedtecBot`, auth por apikey, reconexión (delegada a socket.io)
  send-message.ts      # sendGroupMessage(groupJid, text) — POST /message/sendText/{instance}, ver punto abierto #3
  groups.ts            # findEmpresaByGroupJid(groupJid) — lee la tabla propia `whatsapp_groups` (Postgres), no ra_whatsapp_groups

src/channels/whatsapp/
  message-handler.ts    # listener de `messages.upsert`: filtra por @g.us, filtra por mención (punto abierto #4), resuelve empresa vía groups.ts, empuja al debounce-queue existente (source: "whatsapp"), y en el flush llama a askDaniel() + sendGroupMessage() con la respuesta
  index.ts              # connectWhatsapp()/disconnectWhatsapp(), wireado en bot.ts junto a connectRealtime()
```

- **Reuso, no reinvención**: el debounce/cola con BullMQ (`messaging/debounce-queue.ts`) ya está armado para esto desde el diseño original — `jobId`/buffer key ya incluyen `source` (sería `"whatsapp"`) además de usuario y conversación, así que un cliente escribiendo en Slack y en un grupo de WhatsApp a la vez no se mezclan (mismo mecanismo del bug de canal cruzado ya arreglado, punto 16). `askDaniel()` ya es channel-agnostic (`userMessage, slackUserId, channelId, client?`) — para WhatsApp, el "userId"/"channelId" que identifican la conversación pasan a ser el `group_jid` (no hay usuario 1:1 real dentro de un grupo salvo que se decida trackear por `participant`, a confirmar con Jorge si hace falta para el perfil de cliente o alcanza con el grupo como unidad de conversación).
- **Sin tool nueva de agente** — esto es un canal, no una capability. Ningún archivo de `agent/` cambia salvo, eventualmente, pasar el `empresa` ya resuelto al mismo lugar donde hoy se resuelve `findTechAgentConfig`.
- **Tabla `whatsapp_groups`** (Postgres propio, ver punto abierto #1): `group_jid` (PK, texto), `empresa` (FK lógica a `customers.empresa`), `nombre_grupo` (para que quien la mantenga sepa qué está asignando sin tener que ir a WhatsApp), `created_at`. Mismo espíritu que `tech_agents`: agregar un cliente nuevo es un `INSERT`, no un deploy.

### Config

- `src/config/env.ts`: `whatsappEvolutionUrl` (`WHATSAPP_EVOLUTION_URL`), `whatsappEvolutionApiKey` (`WHATSAPP_EVOLUTION_API_KEY`), `whatsappEvolutionInstance` (`WHATSAPP_EVOLUTION_INSTANCE`, default `"RedtecBot"`) — **no** en `REQUIRED_ENV_VARS` (deben poder faltar sin romper el arranque).
- `.env.example`: documentar las 3, con nota de que la API key es la del número compartido de RedTec (no una por cliente).
- `package.json`: agregar `socket.io-client` si no está ya (ya lo trajo el plan de realtime) — confirmar antes de agregar de nuevo.

## Datos de referencia (grupos que ve hoy el número compartido, pasados por Fernando 2026-09-06)

**[CLASIFICADO 2026-09-06 por Jorge, sembrado en código]** — `npm run migrate:whatsapp-groups` (`src/migrate-whatsapp-groups.ts`) siembra esta clasificación real, idempotente. **Pendiente de correr contra producción**: hace falta deployar este código primero (la tabla `whatsapp_groups` no existe todavía en producción, se crea sola al primer connect vía `schema.ts`) y recién ahí correr el script — nada de esto se activó ni se corrió contra producción en esta sesión.

| group_jid | nombre visible | empresa (`whatsapp_groups`) |
|---|---|---|
| `120363408879151065@g.us` | Cofiño | Cofiño |
| `120363429256024611@g.us` | Expansión Redtec (Garoo) | — interno, no mapeado |
| `120363407997314089@g.us` | Front End - Garoo | — interno, no mapeado |
| `120363392107150448@g.us` | RedTec Dev | — interno, no mapeado |
| `120363410662746111@g.us` | RedTec <> Reynoso Bienes Raices | Reynoso Bienes Raices |
| `120363428875380678@g.us` | RedTec AI <> Grupo Althura | Grupo Althura |
| `120363426250050151@g.us` | RedTec AI <> Constructora Rosero | Constructora Rosero |
| `120363430598286467@g.us` | Mundo Verde | Mundo Verde |
| `120363413744935411@g.us` | RedtecAi | — interno, no mapeado |
| `120363403874344508@g.us` | RedTec <> Bravante | Bravante |
| `120363409107032925@g.us` | RedTec x RNR | RNR |
| `120363428188434247@g.us` | TRAFICO RFSCRS :::: RNR.23 | RNR (mismo tenant que la fila anterior, confirmado por Jorge) |

## Archivos a tocar (cuando los puntos abiertos estén resueltos)

- Nuevos: `src/integrations/evolution-api/{client,send-message,groups}.ts` (+ tests: `groups.ts` con Postgres mockeado, `send-message.ts` con fetch mockeado)
- Nuevos: `src/channels/whatsapp/{message-handler,index}.ts` (+ test del filtro de mención, mismo patrón que `slack/message-handler.test.ts` si existe)
- Nueva migración Postgres: tabla `whatsapp_groups`
- Editar: `src/config/env.ts`, `.env.example`, `src/channels/slack/bot.ts` (o donde se centralice el "warmup" de boot — connect/disconnect junto a `connectRealtime()`)

## Verificación

1. `npx tsc --noEmit` y `npm test` en verde con los tests nuevos.
2. Arrancar el bot **sin** las 3 env vars de WhatsApp — confirmar que arranca igual y que Slack sigue funcionando sin cambios (log "WhatsApp deshabilitado, faltan credenciales").
3. Con credenciales reales cargadas: confirmar en logs "WhatsApp conectado" y que un `INSERT` de prueba en `whatsapp_groups` (jid de un grupo de prueba, no uno real de cliente) hace que Daniel responda solo cuando lo mencionan ahí, y que ignora silenciosamente un grupo no mapeado.
4. Confirmar que un mensaje en Slack y uno en WhatsApp del mismo cliente en la misma ventana de debounce no se cruzan (mismo test manual que ya se hizo para el bug del punto 16, pero cruzando Slack↔WhatsApp en vez de canal↔canal de Slack).
5. Antes de habilitarlo contra la instancia compartida real de producción: confirmar con Fernando el punto abierto #2 (¿pisa su conexión?) — probar primero, si es posible, contra un grupo de prueba propio.
