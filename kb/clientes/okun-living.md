# OKÜN Living (Grupo VEQ) (`empresa` propuesta: `OKÜN Living`)

> Cliente descubierto en vivo en crm.redtec.ai el 2026-09-22 — **no aparece en ningún otro sistema documentado** (no está en Monday, ni en los repos de Garoo, ni en `whatsapp_groups`/`tech_agents`/`monday_clientes` de Daniel). Todo lo que sigue viene de la sesión en vivo como superadmin.
>
> **Visibilidad: Cliente** (scoped a OKÜN Living) para todo este archivo — no hay en él ninguna cifra comparativa con otros tenants ni nombres internos de RedTec. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Tenant `okunlivinggrupoveq` en **CRM Realstate** (`crm.redtec.ai`), recién provisionado. "Grupo VEQ" es el grupo/desarrollador; "OKÜN Living" el nombre del proyecto/marca. **No hay contenido real cargado todavía**: el agente sigue con nombre genérico "Asistente" (no se le puso un nombre propio ni avatar), mensaje de bienvenida por defecto ("¡Hola! ¿En qué te puedo ayudar?"), y "Qué vende este proyecto" en el valor por defecto "Proyectos (inmuebles)".

## Sistemas y componentes

- Tenant en `crm.redtec.ai`, admin registrado: Jorge Menzel (`admin@okunlivinggrupoveq.demo.redtec.ai` — nótese el subdominio `.demo.`, consistente con que sigue en fase de armado/demo).
- 0 contactos, 0 mensajes, 0 conversaciones activas, 0 Google Calendar conectado.
- Roster de 6 agentes disponible (Isabella, Sofi, Walter, Arturo, Daniel, Marco) pero solo 1/6 "activo" (el genérico "Asistente"), y aun así el tenant completo figura **Inactivo**.

## Cómo funciona

Todavía no funciona: el panel indica explícitamente *"Para activar el agente falta configurar el LLM y el token de ManyChat"*. Es decir, faltan como mínimo: elegir modelo (pestaña Modelo), conectar ManyChat (pestaña WhatsApp), y darle identidad propia (nombre/avatar/mensaje de bienvenida en Identidad) antes de que atienda tráfico real.

## Estado actual (2026-09-22)

Tenant provisionado pero sin configurar — no hay nada que soportar todavía. Si un ticket llega mencionando "OKÜN Living" o "Grupo VEQ", lo más probable es que sea sobre el setup inicial (falta LLM/ManyChat), no sobre un problema en producción. Escalar a quien esté armando este tenant (no identificado en ningún lado — solo aparece Jorge Menzel como admin del lado del cliente).
