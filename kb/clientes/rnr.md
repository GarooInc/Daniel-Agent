# RNR — Rock N Rolla (`empresa`: `RNR` — ya existe en las tablas de Daniel)

> Separado el 2026-09-24 de `kb/clientes/rnr-y-otros.md` (mezclaba a RNR con clientes ajenos sin
> relación — ver `kb/inventario-clientes-menores.md` para el resto, que no debe cargarse como
> `client_wiki`). Fuentes: `Agent-Support/Daniel-Agent/src/migrate-monday-clientes.ts`,
> `ESTADO-PROYECTO.md` punto 32, `RedtecPortal/redtec-portal-frontend/src/clients/RocknRolla/`,
> tablero legacy de Monday.
>
> **Visibilidad por defecto: Cliente** (scoped a RNR). Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

- En `monday_clientes`, el único mapeo real es "Rock N Rolla" → `RNR`. Tiene dos grupos de WhatsApp con RedTec: uno de soporte ("RedTec x RNR") y otro de tráfico/campañas.
- En el RedTec Portal tiene un módulo propio, **"Talento RocknRolla"**: tabla de aplicaciones/candidatos, filtros, detalle del trabajador, generación de PDF. Es parte de "RR Jobs", su portal de empleo (paginación, filtros, notificaciones, formularios de RRHH).
- También tiene tableros de Monday para gestión de trabajo, con sincronización a Google Calendar (hubo un bug donde los ítems sincronizados quedaban como "Elemento nuevo" sin el nombre real de la reunión — reportado).
- Sus tickets de soporte llegan al tablero de Daniel creados por el propio agente/sistema del cliente (la columna "Cliente" ya viene poblada).
- **Gap**: no hay documentación de qué chatbot o agente conversacional opera RedTec para RNR, si es que existe uno — solo constan estos módulos de portal/gestión.
