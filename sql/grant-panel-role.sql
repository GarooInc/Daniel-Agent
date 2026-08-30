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

-- Edición de pregunta/respuesta de FAQs desde /conocimiento (Base de Conocimiento del panel),
-- coordinado con la sesión de Support-Agent-Panel (2026-08-28). support_panel_reader ya tenía
-- SELECT en documents (usado para listar FAQs en el panel); este GRANT solo suma UPDATE acotado
-- a esas 3 columnas para que el panel nunca pueda escribir `embedding` directo (un vector
-- cualquiera ahí rompe la búsqueda semántica sin error visible) — el recálculo real corre de
-- este lado (integrations/postgres/faq-embedding-sync.ts, setInterval cada 60s, reembede todo
-- `documents`).
GRANT UPDATE (pregunta, respuesta, updated_at) ON documents TO support_panel_reader;

-- Indicador "Daniel en línea" del Topbar del panel (2026-08-28) — lee la antigüedad de
-- daniel_heartbeat.updated_at para decidir online/offline. Solo lectura.
GRANT SELECT ON daniel_heartbeat TO support_panel_reader;

-- Sección "Registro de actividad" del panel (2026-08-30), coordinado con la sesión del panel
-- y confirmado por Jorge directamente (incluye el riesgo aceptado de mostrar
-- chat_messages.content completo en el panel sin login todavía). Solo lectura, sin tocar
-- columnas de escritura.
--
-- Notas para quien construya la vista, ya en conocimiento del panel:
--   - chat_messages no tiene FK a ticket_conversations; se poda a 100 filas por usuario y se
--     borra completa al crear un ticket o al detectar sesión nueva (+1h) — no es un log durable.
--   - webhook_raw_events.headers NO debe renderizarse en el panel: guarda los headers crudos
--     del request, incluido x-webhook-secret si el caller lo manda (valor real de
--     WEBHOOK_SECRET). El panel solo va a mostrar route/received_at/parsed/body.
GRANT SELECT ON chat_messages, webhook_raw_events TO support_panel_reader;
