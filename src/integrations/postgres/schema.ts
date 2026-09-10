// DDL idempotente de las 9 tablas que reemplazan a las colecciones de MongoDB (ver
// plans/2026-08-18-migracion-postgresql-pgvector.md). Vive como constante TS, no como archivo
// .sql suelto, porque el Dockerfile solo copia `dist/` (salida de `tsc`) a la imagen final —
// un .sql en src/ no viajaría al build de producción sin un paso extra de copiado de assets.
// `client.ts` la corre una sola vez, al primer connect, igual que `mongo/client.ts` crea sus
// índices al conectar — mismo patrón, sin sumar una herramienta de migraciones (Knex/Prisma/etc.).
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

-- Equivalente a la colección "documents" de Mongo: FAQs con su embedding precalculado.
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  producto TEXT,
  categoria TEXT,
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  tags TEXT[],
  embedding vector(1536) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS documents_producto_idx ON documents (producto);

-- Equivalente a "customers": perfil de Slack + cuenta real, clave canónica email.
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  slack_user_id TEXT,
  nombre_cliente TEXT,
  email TEXT,
  empresa TEXT,
  producto TEXT,
  plan TEXT,
  estado_cuenta TEXT,
  fecha_alta TEXT,
  canal_preferido TEXT,
  notas TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_key ON customers (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_slack_user_id_idx ON customers (slack_user_id) WHERE slack_user_id IS NOT NULL;

-- Equivalente a "chat_histories": normalizado por fila (una por mensaje) en vez de array
-- embebido por documento — más simple de acotar con ORDER BY + LIMIT en Postgres.
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  slack_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('human', 'ai')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx ON chat_messages (slack_user_id, created_at);

-- Equivalente a "ticket_drafts": borrador de ticket en construcción, un registro por usuario.
CREATE TABLE IF NOT EXISTS ticket_drafts (
  slack_user_id TEXT PRIMARY KEY,
  nombre_cliente TEXT,
  email TEXT,
  resumen TEXT,
  urgencia TEXT,
  tipo_solicitud TEXT,
  producto TEXT,
  que_se_intento_ya TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Equivalente a "ticket_conversations": correlación mondayItemId -> conversación de Slack.
CREATE TABLE IF NOT EXISTS ticket_conversations (
  monday_item_id TEXT PRIMARY KEY,
  slack_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Equivalente a "tech_agent_handoffs": handoff Daniel <-> Agente Técnico por threadTs.
CREATE TABLE IF NOT EXISTS tech_agent_handoffs (
  thread_ts TEXT PRIMARY KEY,
  shared_channel_id TEXT NOT NULL,
  original_slack_user_id TEXT NOT NULL,
  original_channel_id TEXT NOT NULL,
  resumen_problema TEXT NOT NULL,
  monday_item_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'timeout')),
  causa_raiz TEXT,
  componente_afectado TEXT,
  respuesta_cruda TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tech_agent_handoffs_pending_idx ON tech_agent_handoffs (thread_ts) WHERE status = 'pending';

-- Equivalente a "webhook_raw_events": payloads crudos del webhook genérico. TTL de 30 días
-- reemplazado por la limpieza periódica de integrations/postgres/retention.ts (Postgres no
-- tiene TTL indexes nativos).
CREATE TABLE IF NOT EXISTS webhook_raw_events (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  headers JSONB NOT NULL,
  body JSONB,
  raw_body TEXT NOT NULL,
  parsed BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS webhook_raw_events_received_at_idx ON webhook_raw_events (received_at);

-- Equivalente a "platform_metrics": telemetría del WebSocket de RedTec. TTL de 7 días,
-- misma limpieza periódica que arriba.
CREATE TABLE IF NOT EXISTS platform_metrics (
  id BIGSERIAL PRIMARY KEY,
  containers JSONB NOT NULL,
  disk JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_metrics_received_at_idx ON platform_metrics (received_at);

-- Equivalente a "platform_events": eventos de CRM (leads/citas) del WebSocket de RedTec.
CREATE TABLE IF NOT EXISTS platform_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  tenant_id TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_events_tenant_received_idx ON platform_events (tenant_id, received_at);

-- Ruteo cliente -> canal privado + bot del Agente Técnico (Hermes Agent) de ese cliente.
-- Reemplaza la tabla TECH_AGENTS hardcodeada en config/tech-agents.ts (2026-08-21) — el
-- objetivo es que sumar un cliente nuevo sea un INSERT, no un deploy de código.
CREATE TABLE IF NOT EXISTS tech_agents (
  empresa TEXT PRIMARY KEY,
  slack_channel TEXT NOT NULL,
  slack_bot_user_id TEXT NOT NULL
);

-- Config de Daniel editable en vivo desde Support-Agent-Panel (system prompt, reglas de
-- negocio, tools habilitadas). Fila única (id fijo en 1) — sin historial de versiones por
-- ahora, se suma si hace falta. El panel escribe acá con un rol de Postgres propio, acotado
-- a SELECT/UPDATE solo sobre esta tabla (ver sql/grant-panel-role.sql, no se commitea con
-- credenciales). Ver integrations/postgres/agent-config.ts para el lado que lee esto.
-- whatsapp_internal_group_jid/slack_escalation_channel (2026-09-09): mismo mecanismo que
-- system_prompt — NULL/vacío cae al env var (WHATSAPP_INTERNAL_GROUP_JID/SLACK_ESCALATION_CHANNEL)
-- como default, así que el deploy de este cambio no depende de sembrar la fila primero. Ver
-- integrations/postgres/agent-config.ts.
CREATE TABLE IF NOT EXISTS daniel_agent_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  system_prompt TEXT,
  business_rules JSONB NOT NULL DEFAULT '[]',
  connected_tools JSONB,
  whatsapp_internal_group_jid TEXT,
  slack_escalation_channel TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
-- La tabla ya existe en producción desde el 2026-08-27 (CREATE TABLE IF NOT EXISTS de arriba es
-- un no-op ahí) — hace falta ALTER explícito para que las 2 columnas nuevas aparezcan sin
-- borrar/recrear la fila real que ya tiene el panel.
ALTER TABLE daniel_agent_config ADD COLUMN IF NOT EXISTS whatsapp_internal_group_jid TEXT;
ALTER TABLE daniel_agent_config ADD COLUMN IF NOT EXISTS slack_escalation_channel TEXT;

-- Heartbeat de proceso para el indicador "Daniel en línea" de Support-Agent-Panel (Topbar).
-- Fila única (id fijo en 1), actualizada cada ~20-30s por integrations/postgres/heartbeat.ts
-- mientras el proceso está vivo. El panel decide online/offline comparando la antigüedad de
-- updated_at (no hay avisos push ni endpoint HTTP — ver ESTADO-PROYECTO.md para la comparación
-- de opciones). Rol support_panel_reader tiene SELECT nada más (sql/grant-panel-role.sql).
CREATE TABLE IF NOT EXISTS daniel_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ruteo grupo de WhatsApp -> cliente (canal nuevo, ver
-- plans/2026-09-06-canal-whatsapp-evolution-api.md). Mismo espíritu que tech_agents: sumar o
-- reasignar un grupo es un INSERT, no un deploy. Poblada a mano a propósito — no hay
-- sincronización automática con ra_whatsapp_groups (vive en la base de otro sistema, RedTec;
-- punto abierto #1 del plan, resuelto por decidir NO depender de esa tabla ajena).
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  group_jid TEXT PRIMARY KEY,
  empresa TEXT NOT NULL,
  nombre_grupo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Base de conocimiento técnico por cliente (2026-09-07, ver plans/2026-09-07-client-wiki.md),
-- patrón "LLM Wiki" de Karpathy adaptado a Postgres (el gist original asume archivos en disco;
-- este contenedor es stateless, así que la página compilada vive acá en vez de en un .md).
-- tech_agent_handoffs ya hace de capa "raw" (inmutable) — esta tabla es la capa "wiki"
-- compilada: una página por cliente que se FUSIONA con cada diagnóstico nuevo, no se apila.
-- Objetivo: que Daniel pueda responder sobre el sistema de un cliente con una lectura
-- determinística (por empresa, sin embeddings ni búsqueda) en vez de consultar al Agente
-- Técnico en vivo en cada pregunta.
CREATE TABLE IF NOT EXISTS client_wiki (
  empresa TEXT PRIMARY KEY,
  contenido TEXT NOT NULL,
  fuentes TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mapeo texto libre de la columna "Cliente" del tablero de Monday (text_mm5s75rw, poblada por
-- el agente de cada cliente al crear su propio ticket, no por Daniel) -> empresa como se usa
-- en whatsapp_groups/tech_agents. Hace falta porque el valor no calza 1:1 (confirmado en vivo
-- 2026-09-09: la columna trae "Rock N Rolla", pero whatsapp_groups.empresa para ese cliente es
-- "RNR") — y porque ni siquiera está garantizado que venga poblada (el ticket de Rosero Construye
-- la tenía vacía, solo el nombre en el título). Mismo espíritu que tech_agents/whatsapp_groups:
-- sumar un cliente nuevo es un INSERT, no un deploy. Ver monday-webhook-handler.ts.
CREATE TABLE IF NOT EXISTS monday_clientes (
  monday_cliente TEXT PRIMARY KEY,
  empresa TEXT NOT NULL
);

-- Log crudo de mensajes de grupos de WhatsApp (2026-09-10, pedido del panel para la sección
-- "Registro de actividad" — hoy solo tiene visibilidad del grupo interno "RedTec Dev" vía
-- chat_messages, que se poda/borra y no distingue remitente). Mismo espíritu que
-- webhook_raw_events: se loguea todo mensaje de grupo que llega por Evolution API, esté o no
-- mapeado en whatsapp_groups y esté o no mencionado el bot, para no perder historial de grupos
-- de clientes reales el día que tengan vía de ingesta propia. TTL de 30 días, misma limpieza
-- periódica que webhook_raw_events (ver integrations/postgres/retention.ts). El panel joinea
-- por group_jid contra whatsapp_groups para mostrar el cliente en vez del JID crudo.
CREATE TABLE IF NOT EXISTS whatsapp_messages_raw (
  id BIGSERIAL PRIMARY KEY,
  group_jid TEXT NOT NULL,
  participant TEXT,
  participant_alt TEXT,
  texto TEXT NOT NULL,
  mentioned BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_raw_group_created_idx ON whatsapp_messages_raw (group_jid, created_at);
`;
