# Wyndham Guatemala (`empresa` propuesta: `Wyndham Guatemala`)

> Alias: Wyndham Garden Guatemala City, WYNDHAM/WINDHAM (nombres de workflows, inconsistentes). **No existe todavía en las tablas de Daniel.** Hotel hermano de El Convento. Fuentes: `Agent-Windham/wiki/entities/wyndham-guatemala.md`, `Agent-Windham/STATUS.md`.
>
> **Visibilidad por defecto: Cliente** (scoped a Wyndham Guatemala). Las secciones marcadas **[INTERNO]** son detalle de arquitectura/diagnóstico de RedTec — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Wyndham Garden Guatemala City (Zona 10). Agente informativo (no toma reservas, no cotiza eventos) que reemplaza un bot previo en ManyChat.

## Sistemas y componentes **[INTERNO]**

- n8n: `WYNDHAM - PRINCIPAL` (71 nodos), `WYNDHAM - KB_SEARCH`, `WYNDHAM - NOTIFICATIONS`, `WINDHAM - VECTORIZAR_KB` (inactivo, nunca ejecutado — correrlo reemplaza los 17 docs de la KB), `WYNDHAM - ERROR HANDLER`.
- Nota de nombres: un rename interno "wyndham"→"windham" nunca se completó en el nombre visible de 4 de los 5 workflows (siguen mostrando "WYNDHAM").
- Vectorización con **Atlas Vector Search + Automated Embedding** (índice `wyndham_index`, modelo `voyage-4`) — distinto al resto de clientes de la plantilla concierge.
- ManyChat propio (credencial "ManyChat WYNDHAM"): **solo Instagram y Facebook**, sin WhatsApp conectado.

## Cómo funciona

Plantilla concierge estándar; handoff por categoría **excepto eventos** (el prompt oficial prohíbe levantar datos o cotizar eventos por este canal).

## Incidentes conocidos y resolución **[INTERNO]**

- 2026-09-10: `NOTIFICATIONS` no tenía rama para la categoría `reserva` (esas notificaciones se perdían en silencio) → corregido.
- El botón "Probar Solicitud" de ManyChat manda `canal_ingreso: null` — es un artefacto de esa prueba, no un bug.
- Probar por WhatsApp falla porque esa cuenta de ManyChat no tiene WhatsApp conectado (no es un bug).

## Escalamiento

Quejas / hablar con una persona → servicio al cliente (bandeja genérica) + WhatsApp de recepción. Eventos → bandeja de servicio al cliente (solución permanente mientras no se habilite cotización). Empleo → gerencia general.

## Estado actual

Activo en producción desde 2026-09-11, validado con tráfico real de Instagram.
