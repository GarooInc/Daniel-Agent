# El Convento (`empresa` propuesta: `El Convento`)

> Alias: CONVENTO, El Convento Boutique Hotel (Antigua Guatemala). **No existe todavía en las tablas de Daniel.** Comparte gerencia con Wyndham Guatemala. Fuentes: `Agent-Convento/wiki/entities/el-convento.md`, `Agent-Convento/STATUS.md`, `Agent-Convento/wiki/concepts/workflows-adaptados.md`.
>
> **Visibilidad por defecto: Cliente** (scoped a El Convento). Las secciones marcadas **[INTERNO]** son detalle de arquitectura/diagnóstico de RedTec — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Hotel boutique de lujo en Antigua Guatemala. Agente **solo informativo** (no confirma reservas ni ejecuta acciones), tono profesional-cálido; reemplazó al bot anterior en ManyChat (migración de flows completada 2026-09-08). Construido adaptando el agente de El Injerto (que a su vez viene de Hoteles Belize).

## Sistemas y componentes **[INTERNO]**

- n8n: `CONVENTO_PRINCIPAL` (71 nodos, webhook `.../webhook/convento-agent`), `CONVENTO_KB_SEARCH`, `CONVENTO_NOTIFICATIONS`, `CONVENTO_Vectorizar KB` (manual, 13 chunks), `CONVENTO_ANALYTICS_SUMMARY` (Sheet "Analytics Bot_El Convento"), `CONVENTO - ERROR HANDLER`.
- ManyChat: **solo Messenger e Instagram** (WhatsApp no conectado).
- Credenciales propias de Mongo/OpenRouter; Google Sheets usa temporalmente la cuenta de soporte de Garoo.

## Cómo funciona

Plantilla concierge estándar. Categorías de notificación: `eventos | colaboraciones | empleo | proveedores | escalamiento` (la categoría `reserva` **no** notifica: el bot solo da el link/contacto de reservas). Red de seguridad determinística: si `categoria == escalamiento`, se fuerza la notificación aunque el modelo no llame la tool.

## Incidentes conocidos y resolución **[INTERNO]**

- 2026-09-02: conflicto de path de webhook al publicar → corregido.
- 2026-09-08: el escalamiento no notificaba al equipo porque el modelo no llamaba la tool → nodos `IF Escalamiento` + `Escalamiento Safety Net`.
- 2026-09-10: `Duration of Conversation` siempre daba "0 min" y los updates de usuario recurrente nunca persistían (mismo bug de `_id` de Mongo que Injerto) → fix portado.
- 2026-09-16: reintento a un usuario fuera de la ventana de 24 h de Meta falló (código 3031) → se respondió manualmente desde ManyChat. Pendiente evaluar el message tag `HUMAN_AGENT`.
- Workflow `ERROR HANDLER` duplicado (huérfano) fue archivado.

## Escalamiento

Reservas → bandeja compartida de reservaciones. Ventas/eventos → bandeja de ventas. Quejas/empleo → jefe operativo. Los dos implementadores RedTec quedan en copia de toda notificación.

## Estado actual

En producción; primera conversación real por Instagram confirmada 2026-09-09. Abierto sin decisión: soporte de message tag para responder fuera de la ventana de 24 h.
