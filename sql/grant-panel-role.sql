-- Rol de Postgres para Support-Agent-Panel: acceso de solo lectura a ticket_conversations (ya
-- en uso) + lectura/escritura acotada a daniel_agent_config (system prompt, reglas de negocio,
-- tools conectadas editables desde el panel). NO ejecutar en CI ni commitear con la contraseña
-- real puesta — reemplazar :'panel_password' con un valor generado y guardarlo en el secret
-- manager del panel, no en este repo.
--
-- Uso: psql "$DATABASE_URL" -v panel_password='...' -f sql/grant-panel-role.sql

CREATE ROLE support_agent_panel WITH LOGIN PASSWORD :'panel_password';

GRANT CONNECT ON DATABASE CURRENT_DATABASE() TO support_agent_panel;
GRANT USAGE ON SCHEMA public TO support_agent_panel;

-- Ya existente: lectura de conversaciones para el panel.
GRANT SELECT ON ticket_conversations TO support_agent_panel;

-- Nuevo: lectura/escritura solo de la config de Daniel, nada más. Sin DELETE (la fila es única,
-- id=1, y no debería poder borrarse desde el panel) ni INSERT (la fila la crea la siembra de
-- migrate:agent-config, el panel solo actualiza la que ya existe).
GRANT SELECT, UPDATE ON daniel_agent_config TO support_agent_panel;
