# Constructora Rosero / Rosero Construye (`empresa`: `Constructora Rosero`)

> Tenant `rosero`, prefijo `rs_`, en `crm.redtec.ai` (Isabella/Sofía). Ecuador. En Monday el
> ticket real de este cliente llegó con el texto "Rosero Construye" en el título — mapeo propuesto
> en `monday_clientes`: "Rosero Construye" → `Constructora Rosero` (ver
> `kb/gaps-y-decisiones.md`). Separado el 2026-09-24 de `kb/clientes/tenants-crm-realstate.md`.
> **No existe todavía en `whatsapp_groups`/`tech_agents`.**
>
> **Visibilidad por defecto: Cliente** (scoped a Constructora Rosero). Las secciones/líneas
> marcadas **[INTERNO]** nunca deben responderse en el canal de este cliente. Ver
> `kb/politica-acceso-y-visibilidad.md`.

## Resumen

- **Estado**: Live desde la migración del 2026-09-01.
- **Agentes**: Sofía (ventas 1:1 por WhatsApp/ManyChat), Walter (staff), Sofi (comentarios de redes/captions). KB con 263 entradas, sincronizada con Monday.
- **Proyectos**: **MAWA** y **LUZ** (estudio/suite/2 habitaciones). En LUZ ya no se deben ofrecer suites en pisos altos con vista.
- **Reglas**: trato de "usted", sin presión comercial, una pregunta de calificación por turno; **no preguntar directamente si es para inversión o para vivir** (se retiró esa pregunta); los prospectos no se auto-agendan citas (derivan a asesores); guardia anti-comercial activa.

## Ops RedTec **[INTERNO]**

Owner: Hugo Arias. Grupo de WhatsApp: "RedTec AI <> Constructora Rosero".

## Incidentes / solicitudes **[INTERNO]**

Pausar a Sofía cuando un asesor responde desde la app nativa de Facebook/Instagram/WhatsApp (resuelto); no mandar followups automáticos si el asesor ya está conversando con el prospecto (resuelto); bloquear leads duplicados por teléfono o email (resuelto); agregar el proyecto **Credicasa** a la KB; alucinaciones al hablar de avances de obra; no se podía crear un contacto manualmente y el correo de notificación mostraba el número en vez del nombre del lead (corregido); Sofi debía responder también comentarios de Facebook (resuelto); restaurar el origen de un lead; pedido de métricas de Meta por pieza/campaña; reporte de leads reasignados tras la baja de un asesor.

## Nota de mapeo **[INTERNO]**

Un ticket real llegó al tablero de soporte de Daniel con la columna "Cliente" vacía (solo el nombre "Rosero Construye" en el título) — Daniel no pudo avisar por WhatsApp porque `monday_clientes` no tiene ese mapeo todavía. Falta agregarlo.

## Confirmado en vivo (2026-09-22) **[INTERNO]**

Agente "Sofia" sobre `anthropic/claude-sonnet-4-6`, 1636 contactos, 6 conversaciones activas simultáneas, 225 mensajes ese día — el tenant con más actividad concurrente de toda la plataforma. Los 6 agentes del roster están activos (Isabella/Sofia, Sofi, Walter, Arturo, Daniel, Marco).
