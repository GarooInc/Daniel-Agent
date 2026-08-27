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
`;
