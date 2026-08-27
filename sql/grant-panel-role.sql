-- GRANT idempotente para el rol real de Support-Agent-Panel: `support_panel_reader` (ya
-- existente, es el mismo que usan para leer ticket_conversations vía DANIEL_DATABASE_URL —
-- no crear un rol nuevo). Da lectura/escritura acotada a daniel_agent_config (system prompt,
-- reglas de negocio, tools conectadas editables desde el panel), sin tocar contraseñas.
--
-- Nota histórica (2026-08-27): esta primera versión del script creaba un rol nuevo
-- `support_agent_panel` — resultó ser un rol huérfano ya existente en la BD, de origen sin
-- identificar (no es el rol real del panel ni algo creado por esta coordinación). El GRANT que
-- se le había dado por error ya se revocó; ver ESTADO-PROYECTO.md para el detalle. Se deja este
-- script apuntando al rol correcto para evitar que alguien lo reuse mal en el futuro.
--
-- Uso: psql "$DATABASE_URL" -f sql/grant-panel-role.sql

GRANT SELECT ON ticket_conversations TO support_panel_reader;

-- Sin DELETE (la fila es única, id=1, no debería poder borrarse desde el panel) ni INSERT (la
-- fila la crea la siembra de migrate:agent-config, el panel solo actualiza la que ya existe).
GRANT SELECT, UPDATE ON daniel_agent_config TO support_panel_reader;
