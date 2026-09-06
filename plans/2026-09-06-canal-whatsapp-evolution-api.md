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

1. **¿De dónde sale el mapeo `group_jid → empresa` que usa Daniel?** `ra_whatsapp_groups` vive del lado del sistema de Fernando (`api-mainrealstate`, otra base de datos, posiblemente otro motor). Este repo no tiene acceso hoy a esa base, y salir a leer la base de otro sistema en el camino caliente de cada mensaje repite exactamente el problema que ya se evitó en el plan de realtime (no inventar acceso a infra ajena sin confirmarlo). **Alternativa recomendada, mismo patrón que `tech_agents`** (que se migró de hardcodeado a tabla Postgres propia justamente para que sumar un cliente sea un `INSERT`, no un deploy — ver `config/tech-agents.ts`): tabla nueva **`whatsapp_groups`** en el Postgres de Daniel, `group_jid` (PK) → `empresa` (mismo campo que ya usa `customers.empresa` / `findTechAgentConfig`), poblada a mano (o por un ítem de trabajo aparte que la sincronice desde `ra_whatsapp_groups` si Fernando expone una forma de consultarla — a confirmar con él, no asumir que hay una API para eso hoy). **Confirmar con Jorge cuál de las dos vías toma.**
2. **¿Puede Daniel conectarse como un segundo cliente Socket.io a la misma instancia sin pisar la conexión que ya usa `api-mainrealstate`?** La guía de Fernando no lo dice explícitamente. Evolution API normalmente soporta múltiples listeners sobre el mismo namespace de instancia (es pub/sub, no una sesión exclusiva), pero conviene confirmarlo antes de deployar contra la instancia compartida en producción — un error acá afecta al sistema de Fernando también, no solo a Daniel.
3. **Contrato exacto de envío** (para responder, no solo escuchar): la hipótesis ya documentada en el punto 24 es `POST /message/sendText/{instance}` con `{ number: groupJid, text }`. Fernando no lo confirmó explícitamente en esta respuesta (solo habló del lado de escucha/WebSocket) — confirmar antes de implementar el lado de envío, aunque sea con un curl de prueba contra un grupo de prueba.
4. **Formato exacto de `mentionedJid` / cómo detectar que mencionaron a Daniel.** Falta confirmar el JID del propio bot dentro de esos grupos (equivalente al `BOT_USER_ID` de Slack) — sale de la respuesta de `connect`/`instance.info` de Evolution API o de mandar un mensaje de prueba y mirar el payload crudo, no de la documentación genérica.

Mientras estos 4 puntos no estén confirmados, el código se implementa igual que el de realtime: **arranca sin romper nada si `WHATSAPP_EVOLUTION_URL`/`WHATSAPP_EVOLUTION_API_KEY` no están seteadas** (loguea deshabilitado, resto del bot sigue andando), para poder mergear ya y activar la conexión real en cuanto los puntos 1-4 estén resueltos.

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

Sin clasificar todavía — **no asumir tenant_id por el nombre**, es justo el paso manual que describe Fernando. Se deja acá para que quien puebla `whatsapp_groups` no tenga que volver a pedirle la lista:

| group_jid | nombre visible | ¿es cliente? |
|---|---|---|
| `120363408879151065@g.us` | Cofiño | a confirmar |
| `120363429256024611@g.us` | Expansión Redtec (Garoo) | a confirmar |
| `120363407997314089@g.us` | Front End - Garoo | probablemente interno |
| `120363392107150448@g.us` | RedTec Dev | probablemente interno |
| `120363410662746111@g.us` | RedTec <> Reynoso Bienes Raices | cliente |
| `120363428875380678@g.us` | RedTec AI <> Grupo Althura | cliente |
| `120363426250050151@g.us` | RedTec AI <> Constructora Rosero | cliente |
| `120363430598286467@g.us` | Mundo Verde | cliente |
| `120363413744935411@g.us` | RedtecAi | probablemente interno |
| `120363403874344508@g.us` | RedTec <> Bravante | cliente |
| `120363409107032925@g.us` | RedTec x RNR | cliente (¿mismo tenant que la fila siguiente?) |
| `120363428188434247@g.us` | TRAFICO RFSCRS :::: RNR.23 | a confirmar |

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
