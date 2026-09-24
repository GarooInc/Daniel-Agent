# Reynoso Bienes Raíces (`empresa`: `Reynoso Bienes Raices`)

> Tenant `reynosobienesraices`, prefijo `rbr_`, en `crm.redtec.ai`. Salta, Argentina. Separado el
> 2026-09-24 de `kb/clientes/tenants-crm-realstate.md`. `empresa = "Reynoso Bienes Raices"` (sin
> tilde en "Raices") para calzar con el valor ya sembrado en `whatsapp_groups`
> (`migrate-whatsapp-groups.ts`) — no existe todavía en `tech_agents`/`monday_clientes`.
>
> **Visibilidad por defecto: Cliente** (scoped a Reynoso Bienes Raices). Las secciones/líneas
> marcadas **[INTERNO]** nunca deben responderse en el canal de este cliente. Ver
> `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Provisionado, con tráfico bajo todavía. Agente **Lucía** (+ Walter, Sofi). ManyChat configurado. KB con 91 entradas (~62 son listados de propiedades). Pendiente: integrar el inventario de Odoo (parte de la fase de habilitación de Isabella). Su integración con Odoo va por un workflow de n8n (`CRM - TOOL`, carpeta REYNOSO): mismo patrón que Desarrollos CAP (webhook del tenant + agente de IA que decide + tools del CRM en flujos separados).

## Ops RedTec **[INTERNO]**

Grupo de WhatsApp "RedTec <> Reynoso Bienes Raices". Owner: Hugo Arias.

## Confirmado en vivo (2026-09-22) **[INTERNO]**

Modelo `anthropic/claude-sonnet-5`, **6022 contactos** (con diferencia, el tenant con más contactos de toda la plataforma — cruza con los ~62 listados de propiedades del PDF de Monday, así que la mayoría son prospectos/leads, no listados), 0 mensajes ese día, 3/6 agentes activos.
