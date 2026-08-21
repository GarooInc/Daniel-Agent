# Migración de la capa de datos de Daniel: MongoDB Atlas → PostgreSQL + pgvector

## Contexto

En la reunión con Fernando (RedTec, 2026-08-17) se decidió estandarizar el stack de datos del proyecto Spectrum sobre PostgreSQL + `pgvector` en vez de MongoDB Atlas. Alcance ya cerrado con Jorge: **migración completa**, no solo la base de conocimiento — las 9 colecciones que hoy tiene Daniel en Mongo pasan a Postgres. División de trabajo: Fernando provisiona infra, Jorge construye el pipeline de embeddings/búsqueda semántica y toda la capa de datos del lado de Daniel.

La infra ya está lista y verificada (2026-08-18): Postgres 18 + pgvector 0.8.6 corriendo en el mismo VPS de Coolify donde vive Daniel (recurso `daniel`, imagen `pgvector/pgvector:pg18`), extensión `vector` habilitada, sin puerto público expuesto, conectividad interna confirmada desde el contenedor de la app.

Este plan cubre el trabajo de código: diseñar la capa Postgres, migrar cada colección preservando el comportamiento actual, y cortar el tráfico de Mongo a Postgres con el mínimo riesgo.

## Hallazgo clave que define el enfoque

Los ~25 tests que tocan la capa de datos (`vi.mock("../integrations/mongo/customer-profile.js", ...)`, etc.) **mockean el módulo wrapper completo, nunca el driver de Mongo**. Ningún archivo de `agent/`, `channels/` ni los tests conoce el driver — solo llama a funciones exportadas (`getCustomerProfile`, `saveTicketDraftFields`, `searchFaqsBySimilarity`, etc.). Esto significa que la migración es, en esencia, **un reemplazo mecánico archivo por archivo**: si cada archivo nuevo en `integrations/postgres/` expone exactamente las mismas funciones con la misma firma que su equivalente en `integrations/mongo/`, el resto del código (y la mayoría de los tests) no se entera del cambio — solo cambia el import y el path del `vi.mock` en el puñado de tests que lo referencian.

## Qué se migra (9 colecciones Mongo → 9 tablas Postgres)

| Mongo (`integrations/mongo/*.ts`) | Naturaleza | Backfill necesario |
|---|---|---|
| `documents` (`documents.ts`) — FAQs + embeddings | vector search | **Sí** — reusar embeddings ya calculados, no re-llamar a OpenRouter |
| `customers` (`customer-profile.ts`) | perfil real de cliente | **Sí** — dato de negocio, no reproducible |
| `ticket_conversations` (`ticket-conversations.ts`) | correlación ticket↔cliente, vive días | **Sí** — puede haber tickets abiertos en este momento |
| `chat_histories` (`conversation-memory.ts`) | buffer de 1h, autolimpiante | No — arrancar vacía equivale a "sesión nueva" (`daniel.ts` ya trata así cualquier gap de 1h) |
| `ticket_drafts` (`ticket-draft.ts`) | borrador transitorio | No — se reconstruye solo en el próximo mensaje vía `extract-ticket-fields.ts` |
| `tech_agent_handoffs` (`tech-agent-handoff.ts`) | handoff en curso con el Técnico | No, salvo que haya un handoff `pending` exactamente al cortar (riesgo bajo y acotado en el tiempo) |
| `webhook_raw_events` (`webhook-events.ts`) | auditoría cruda, TTL 30d | No — es un log |
| `platform_metrics` (`redtec-realtime/platform-metrics.ts`) | telemetría, TTL 7d | No — todavía sin deployar en producción (bloqueado en URL de RedTec) |
| `platform_events` (`redtec-realtime/crm-events-cache.ts`) | caché sin consumidor todavía | No |

Solo 3 de 9 necesitan backfill real. Esto reduce mucho el riesgo de la ventana de corte.

## Diseño de la capa Postgres

### Conexión (`integrations/postgres/client.ts`)
Mismo patrón que `integrations/mongo/client.ts`: pool singleton perezoso (`pg.Pool`), reseteado a `undefined` en el catch si falla la conexión inicial (mismo fix de reintento que ya existe en Mongo). Al primer `getPool()`, corre `ensureSchema()` — un `schema.sql` idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS vector`) ejecutado inline, igual que hoy `getDb()` crea los índices de Mongo al conectar. No hace falta sumar una herramienta de migraciones (Knex/Prisma/node-pg-migrate) — el proyecto no usa ORM en ningún lado y este patrón "bootstrap idempotente en el connect" ya es el que existe.

Dependencias nuevas: `pg` (driver estándar) + `pgvector` (paquete oficial del proyecto pgvector, expone `toSql`/`fromSql` para serializar el tipo `vector` sin tener que armar el string `'[...]'` a mano) + `@types/pg` como devDependency.

### FAQs vectorizadas (`integrations/postgres/documents.ts`)
Tabla `documents` con columna `embedding vector(1536)`, índice `hnsw (embedding vector_cosine_ops)` (mejor que `ivfflat` para este volumen chico, no necesita fase de "training" con datos). Mismas 3 funciones exportadas que hoy (`upsertFaqDocument`, `ensureFaqVectorIndex` — pasa a ser un no-op o se pliega en `ensureSchema()`, ya que en Postgres el índice se crea sincrónico, sin el "READY" asíncrono de Atlas —, `searchFaqsBySimilarity`).

Query de búsqueda:
```sql
SELECT id, producto, categoria, pregunta, respuesta, tags,
       1 - (embedding <=> $1) AS score
FROM documents
WHERE ($2::text IS NULL OR producto = $2)
ORDER BY embedding <=> $1
LIMIT $3
```
**Resuelto (2026-08-21)**: el score de Atlas (`$vectorSearchScore`) y `1 - cosine_distance` de pgvector no son la misma escala numérica — confirmado con `src/recalibrate-faq-score.ts` corrido en el VPS real (9 preguntas "match" + 3 "irrelevante"): en Postgres los matches dieron 0.6288–0.8469 y los irrelevantes 0.0888–0.4845 (vs. 0.72 calibrado para Mongo, donde los mismos irrelevantes llegaron a dar hasta 0.7423 — la escala no es comparable). **Nuevo `MIN_SCORE` para Postgres: 0.55** (margen de ~0.065 sobre el irrelevante más alto y ~0.08 bajo el match más bajo, mismo criterio que el 0.72 original). Se aplica en `agent/tools/search-faqs.ts` recién en el mismo commit del paso 7 (corte de imports) — cambiarlo antes rompería el filtro sobre Mongo, que sigue siendo el backend activo hasta el corte.

### Resto de las tablas
Traducción directa fila-por-documento de cada wrapper de `integrations/mongo/`, manteniendo la firma de cada función exportada:
- `customer-profile.ts` → tabla `customers` (mismas columnas que `CustomerProfile`, `email` único parcial, índice en `slack_user_id`).
- `conversation-memory.ts` → tabla `chat_messages(slack_user_id, role, content, created_at)` (normalizada en filas, no un array JSONB — más simple de acotar con `ORDER BY created_at DESC LIMIT n`; el `STORED_MESSAGES_CAP` de hoy se vuelve un `DELETE` de las filas más viejas que las últimas 100 por usuario, corrido en cada `appendMessage`).
- `ticket-draft.ts` → tabla `ticket_drafts(slack_user_id PK, ...)`.
- `ticket-conversations.ts` → tabla `ticket_conversations(monday_item_id PK, slack_user_id, channel_id, created_at)`.
- `tech-agent-handoff.ts` → tabla `tech_agent_handoffs` (mismas columnas, `status` como `text` con `CHECK`).
- `webhook-events.ts` / `platform-metrics.ts` / `crm-events-cache.ts` → tablas con columnas `jsonb` para `headers`/`body`/`payload`/`containers`/`disk`.

### Reemplazo de los TTL de Mongo (`integrations/postgres/retention.ts`, nuevo)
Postgres no tiene TTL indexes nativos. En vez de sumar la extensión `pg_cron` (complejidad/permisos extra en el VPS), un módulo nuevo corre `DELETE FROM x WHERE received_at < now() - interval 'N days'` una vez al conectar y después cada N horas con `setInterval` — el proceso de Daniel ya vive corriendo 24/7 (mismo motivo por el que hoy no hace falta un cron externo para nada más). Cubre `webhook_raw_events` (30d) y `platform_metrics` (7d).

## Orden de implementación

1. **Infra base**: agregar `pg`/`pgvector`/`@types/pg`, `integrations/postgres/client.ts` + `schema.sql` con las 9 tablas, `POSTGRES_URL` nuevo en `config/env.ts` (opcional al principio, igual que `redtecRealtimeUrl` hoy) y en `.env.example`/Coolify.
2. **FAQs** (`integrations/postgres/documents.ts`) — el de mayor valor y el más fácil de validar a mano por Slack. Recalibrar `MIN_SCORE`.
3. **Camino caliente de conversación**: `customer-profile.ts`, `ticket-draft.ts`, `conversation-memory.ts` — se tocan en cada mensaje, requieren la prueba más cuidadosa.
4. **Correlación del Agente Técnico**: `ticket-conversations.ts`, `tech-agent-handoff.ts`.
5. **Auditoría/telemetría**: `webhook-events.ts`, `platform-metrics.ts`, `crm-events-cache.ts` + `retention.ts`. Menor riesgo — no son parte del camino de respuesta al cliente.
6. **Backfill — HECHO (2026-08-21).** `src/migrate-mongo-to-postgres.ts` (script `npm run migrate:mongo-to-postgres`), mismo espíritu que `migrate-customers.ts`: copia `documents` (reusando `upsertFaqDocument` de la capa Postgres, embedding ya calculado, sin volver a llamar a OpenRouter), `customers` (SQL directo, no reusa `saveCustomerProfile` porque esa función no preserva `createdAt`/`updatedAt` originales ni admite documentos sin `slackUserId`) y `ticket_conversations` (reusa `saveTicketConversation`, ya idempotente vía `ON CONFLICT`). Idempotente en los 3 casos — se puede correr de nuevo sin duplicar. No borra ni toca Mongo. `tsc --noEmit` limpio y 64/64 tests verdes; **falta correrlo contra el Postgres real del VPS** (hoy solo se verificó type-check + suite mockeada) — hacerlo recién justo antes del corte del paso 7, no antes, para minimizar el delta perdido.
7. **Corte — HECHO (2026-08-21).** Un solo commit que cambió todos los imports de `integrations/mongo/*` a `integrations/postgres/*` en `agent/`, `channels/` (`bot.ts`, `webhook/server.ts`, `tech-agent-response-handler.ts`) y los 7 archivos de test que mockeaban esos paths (mismo `vi.mock`, solo cambió el string del path) — `config/tech-agents.ts` no necesitó cambios, no importa la capa de datos directamente. `agent/tools/search-faqs.ts` pasó a `MIN_SCORE = 0.55` (calibrado el mismo día, ver paso 6) en el mismo commit. `bot.ts` ya no calienta ni importa Mongo — el calentamiento de Postgres pasó a ser el único e incondicional (antes convivían). Verificado: `tsc --noEmit` limpio, 64/64 tests verdes, y un grep confirma cero imports activos de `integrations/mongo/` en `agent/`/`channels/` (solo queda una mención en un comentario). `integrations/mongo/` **no se borró** — queda en el repo sin usarse, como red de rollback (los scripts de un solo uso `migrate-customers.ts`, `migrate-faqs.ts`, `migrate-mongo-to-postgres.ts` y `test-e2e.ts` lo siguen usando/mockeando a propósito, no son parte del corte). Falta desplegar este commit y hacer la verificación en vivo del paso 8 antes de considerar la migración cerrada.
8. **Verificación en vivo post-deploy — HECHO (2026-08-21).** Deployado (push `77d2462`). Confirmado en el contenedor nuevo: log de arranque `"Postgres conectado (calentamiento ok)"` sin ninguna mención a Mongo. Por Slack, "cómo funciona Isabella" disparó `buscar_faqs` sobre pgvector (`MIN_SCORE = 0.55`) y devolvió contenido real y relevante de la FAQ de Isabella, y `escalar_a_monday` creó el ticket `#3178111557` sin problema (perfil, borrador y correlación de ticket todos escritos en Postgres). Consulta directa a la Postgres real confirmó que los 2 `ticket_conversations` migrados en el backfill (`3163142573`, `3163153323`) siguen resolviendo bien. **Migración completa — pasos 1 a 8 del plan cerrados.** Único pendiente: no borrar `integrations/mongo/` todavía (queda de red de rollback) hasta confirmar unos días más en vivo sin sorpresas.

## Archivos nuevos/tocados (representativos, no exhaustivo)
- Nuevo: `src/integrations/postgres/client.ts`, `schema.sql`, `documents.ts`, `customer-profile.ts`, `conversation-memory.ts`, `ticket-draft.ts`, `ticket-conversations.ts`, `tech-agent-handoff.ts`, `webhook-events.ts`, `retention.ts`.
- Tocados (cambian internamente su `getDb` por el pool de Postgres, mismo archivo, no se mueven): `src/integrations/redtec-realtime/platform-metrics.ts`, `crm-events-cache.ts`.
- Tocados (solo el import): `src/agent/daniel.ts`, `src/agent/auto-escalate.ts`, `src/agent/deliver-tech-diagnosis.ts`, `src/agent/tools/*.ts`, `src/channels/slack/tech-agent-response-handler.ts`, y sus tests correspondientes (cambiar el string de `vi.mock`).
- Nuevo script de backfill: `src/migrate-mongo-to-postgres.ts`.
- `package.json` (deps + script `migrate:mongo-to-postgres`), `config/env.ts`, `.env.example`.

## Verificación
- `npx tsc --noEmit` + `npm test` en cada paso (los tests existentes no deberían romperse hasta el paso 7, donde se actualizan los `vi.mock` en el mismo commit que cambia los imports).
- `npm run test:e2e` sigue corriendo contra el in-memory store — no se toca, sigue validando el flujo de negocio end-to-end independiente de qué DB esté detrás.
- Verificación manual contra la Postgres real del VPS (misma vía SSH que hoy) antes de cada corte parcial: consultas `psql` directas para confirmar filas insertadas/queries de búsqueda.
