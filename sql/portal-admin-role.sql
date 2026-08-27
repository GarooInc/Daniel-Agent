-- Rol de Postgres dedicado y de mínimo privilegio para el backend del Portal RedTec
-- (contenedor `redtec-portal-backend`), que va a gestionar desde su panel admin:
-- tech_agents (CRUD), documents (CRUD, ingesta de KB) y agent_prompts (SELECT/INSERT/UPDATE,
-- versiones del SYSTEM_PROMPT de Daniel — ver integrations/postgres/agent-prompt.ts).
--
-- Corrida manual, una sola vez, por quien administra la Postgres de producción (Coolify).
-- No vive en schema.ts / SCHEMA_SQL a propósito: SCHEMA_SQL se re-ejecuta en cada arranque del
-- bot con el rol admin de Daniel, y CREATE ROLE no es idempotente vía IF NOT EXISTS de forma
-- simple ni debería correr sola en cada boot de un proceso no interactivo — la creación de un
-- rol y su password es una acción deliberada de infra, no bootstrap de app.
--
-- Reemplazar CAMBIAR_ESTE_PASSWORD por un password generado (ej. `openssl rand -base64 32`)
-- antes de correr esto. Las credenciales resultantes (host/puerto/db ya conocidos + este user +
-- este password) son lo que se le entrega al equipo del portal para sus env vars
-- DANIEL_PG_HOST / DANIEL_PG_PORT / DANIEL_PG_DATABASE / DANIEL_PG_USER / DANIEL_PG_PASSWORD —
-- nunca las credenciales del rol admin que usa Daniel en producción.

CREATE ROLE redtec_portal_admin WITH LOGIN PASSWORD 'CAMBIAR_ESTE_PASSWORD';

-- Conexión a la DB y uso del schema — sin esto ningún GRANT de tabla sirve.
GRANT CONNECT ON DATABASE postgres TO redtec_portal_admin; -- ajustar "postgres" al nombre real de la DB si es otro
GRANT USAGE ON SCHEMA public TO redtec_portal_admin;

-- tech_agents: CRUD completo (alta/baja/edición de clientes con Agente Técnico).
GRANT SELECT, INSERT, UPDATE, DELETE ON tech_agents TO redtec_portal_admin;

-- documents: CRUD completo (gestión de la base de conocimiento / FAQs).
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO redtec_portal_admin;

-- agent_prompts: sin DELETE a propósito — es un historial de versiones del prompt, se
-- desactivan filas viejas (UPDATE activo = false) al activar una nueva, nunca se borran, para
-- no perder la capacidad de rollback.
GRANT SELECT, INSERT, UPDATE ON agent_prompts TO redtec_portal_admin;
GRANT USAGE, SELECT ON SEQUENCE agent_prompts_id_seq TO redtec_portal_admin;

-- Explícitamente SIN acceso: customers, chat_messages, ticket_drafts, ticket_conversations,
-- tech_agent_handoffs, webhook_raw_events, platform_metrics, platform_events — todas contienen
-- datos de clientes/tickets/telemetría fuera del alcance de este panel. No hace falta un REVOKE
-- explícito: un rol nuevo no tiene privilegios sobre ninguna tabla hasta que se los otorgan, así
-- que la ausencia de GRANT ya es la restricción. Si en el futuro se le agrega a este rol algún
-- privilegio por defecto (ALTER DEFAULT PRIVILEGES) que no debería tener, revisar acá primero.
