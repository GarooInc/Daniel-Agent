# Plataforma RedTec — mapa general para soporte

> Conocimiento transversal (no es de un solo cliente). Datos al **2026-09-22**. Fuentes: PDF "KB-Clientes-RedTec-Sep2026" (Monday, board AI Agent Ops `5103724526`, asset `267623908`, auditoría del 2026-09-08), repos locales de Garoo, y **sesión en vivo como superadmin en crm.redtec.ai** (2026-09-22, marcado "visto en vivo" donde aplica).
>
> **Visibilidad: Interno (archivo completo).** Ver `kb/politica-acceso-y-visibilidad.md`. Este documento compara clientes entre sí, expone infraestructura y nombres internos de RedTec — es para Slack/panel superadmin únicamente. **Nada de este archivo debe usarse para responder en el canal de un cliente** (grupo de WhatsApp de un tenant, widget de crm.redtec.ai de un tenant). Si Daniel necesita explicarle algo de esto a un cliente (ej. qué es Rita, qué reportes recibe), usar la versión ya filtrada en `kb/faqs-candidatas.md` (categoría "Soporte RedTec", filas con `visibilidad: cliente`), no este archivo.

## Los 3 sistemas de clientes (no mezclarlos)

| Sistema | Qué es | Dónde vive | Clientes |
|---|---|---|---|
| **CRM Realstate** (`crm.redtec.ai`) | Plataforma multi-tenant de agentes de IA para inmobiliarias: chat multicanal, CRM por etapas, llamadas de voz con IA, agenda sincronizada con Google Calendar. | Stack `redtec.ai-realstate`, API pública `hub.redtec.ai` (webhooks `hub.redtec.ai/api/webhook/<tenant>`, MCP en `hub.redtec.ai/mcp`). Una base por tenant. | **12 tenants reales (confirmado en vivo 2026-09-22)**: Althura, Axis, Cofiño, Desarrollos CAP, Grupo Paz, Grupo SyG, Mundo Verde, OKÜN Living (Grupo VEQ), Redtec AI, Reynosobienesraices, Rosero Construye, Spectrum (híbrido). Ver detalle en "crm.redtec.ai — estructura del panel" más abajo. Archgroup y Hoteles (los "shells" que listaba el PDF de Monday de sept-2026) **ya no existen como tenants**. |
| **AGMundoV / Mundo Verde (Bravante)** | CRM operativo propio de Bravante (cotizador, unidades, pagos) + automatización de facturas en Odoo. | Contenedor `mundoverde-core` + dashboard, tablas `mv_*`. **No es tenant de CRM Realstate.** | Bravante / Mundo Verde |
| **RedTec Portal** | Portal web de servicios por cliente (facturación, leads, reportes, Guatecompras Radar, panel de agentes). | `redtecportal.netlify.app`, backend `redtec-portal-backend`. | Mundo Verde, Spectrum, Hoteles Belize, RocknRolla, Pepsi, Ficohsa, Guatecompras |

Aparte, varios clientes tienen **agentes en n8n** (`agentsprod.redtec.ai`) con ManyChat + MongoDB (plantilla "concierge", ver abajo): El Injerto, El Convento, Wyndham Guatemala, Hoteles Belize, y Spectrum (Sof-IA).

Un mismo nombre comercial puede existir en varios sistemas (ej. Spectrum = agente n8n + tenant Realstate + módulo en el Portal). Antes de diagnosticar, identificar **en qué sistema** está el problema.

## crm.redtec.ai — estructura del panel (visto en vivo, 2026-09-22)

El panel tiene 3 secciones en el nav superior: **Clientes** (la "Sala de control"), **Pagos** y **Usuarios**.

### Sala de control (Clientes) — los 12 tenants reales, confirmados en vivo

| Tenant | Estado | Agente principal / modelo | Contactos | Agentes activos |
|---|---|---|---|---|
| Althura | Activo | Isabella · `anthropic/claude-sonnet-4-6` | 1372 | 2/6 (Isabella, Walter) |
| Axis | Activo | Isabella · `google/gemini-3.8-flash` | 4 | 1/6 (Isabella) |
| Cofiño | Activo | Isabella · `anthropic/claude-sonnet-5` | 23 | **6/6** (todos), llamadas salientes ON |
| Desarrollos CAP | Activo | Isabella · `deepseek/deepseek-v4.1-flash` | 3 | 2/6 (Isabella, Walter) — Daniel no activo (ver su página) |
| Grupo Paz | Inactivo | Isabella (sin modelo asignado) | 1 | 6/6 configurados pero tenant inactivo — falta LLM + token de ManyChat |
| Grupo SyG | Activo | Isabella · `google/gemini-3.8-flash` | 9 | 2/6 (Isabella, Walter) |
| Mundo Verde | Activo | Isabella · `deepseek/deepseek-v4.1-flash` | 2654 | **6/6** (todos) — el más activo (5 conversaciones simultáneas, 104 msj/día vistos) |
| **OKÜN Living (Grupo VEQ)** | Inactivo | "Asistente" (genérico, sin nombre/avatar propio) | 0 | 1/6 — tenant recién provisionado, sin configurar (falta LLM + token de ManyChat). **No documentado en ningún otro lado** — admin: Jorge Menzel |
| Redtec AI (interno) | Activo | Isabella · `anthropic/claude-sonnet-5` | 257 | 5/7 — es el único tenant con **7** agentes (incluye Dante), llamadas salientes ON |
| Reynosobienesraices | Activo | Lucía · `anthropic/claude-sonnet-5` | 6022 | 3/6 |
| Rosero Construye | Activo | Sofia · `anthropic/claude-sonnet-4-6` | 1636 | 6/6 — 6 conversaciones simultáneas, 225 msj/día vistos |
| Spectrum | Activo | Sof-IA · `anthropic/claude-sonnet-5` | 8 | 1/6 — confirma que el tenant nativo casi no tiene tráfico real (el chatbot real corre aparte en n8n, ver `kb/clientes/spectrum.md`) |

**Ya no existen como tenants** (aunque el PDF de Monday de sept-2026 los listaba como "shells"): Archgroup y Hoteles. Usuarios con dominio `archg.net` (Joaquin Bernardis, Ori Medina) quedaron reasignados al tenant "Redtec AI".

Cada fila de la tabla de Clientes abre un panel de detalle con botones: **Entrar como admin**, **API RED**, **Meta Ads**, **Grupos** (WhatsApp), **Slack**, **Configuración CRM**, **Configurar** (el agente). El estado "Activo/Inactivo" es del tenant completo; por separado, cada uno de los 6 agentes del roster (Isabella, Sofi, Walter, Arturo, Daniel, Marco — Redtec AI además tiene Dante) se activa/desactiva individualmente ("Agentes · N/6 activos"). Un tenant puede figurar "Inactivo" en general con agentes marcados activos si aún le falta configurar el LLM o el token de ManyChat — el panel lo indica explícito: *"Para activar el agente falta configurar el LLM y el token de ManyChat"*.

### "Configurar" (agente) — pestañas confirmadas en vivo

Coincide con lo ya documentado de segunda mano: **Identidad** (nombre del agente, qué vende — "Proyectos" o "Marca" —, avatar, mensaje de bienvenida), **Comportamiento** (system prompt completo editable en vivo, follow-up activo on/off, minutos para follow-up, instrucciones del follow-up, mensaje de cierre por inactividad), **WhatsApp**, **Modelo**, **Voz**. El panel dice explícitamente: *"Los cambios se aplican inmediatamente sin necesidad de redeploy."* El system prompt de un agente real (visto: Althura/Isabella) es extremadamente extenso y específico — precios exactos, unidades disponibles/vendidas, guiones de objeciones, reglas de formato para WhatsApp (una idea por burbuja, cero markdown, trato de usted, etc.). No se debe reproducir contenido de un prompt de un cliente en la KB de otro.

### "API RED" (por tenant)

Sub-pestañas: **API Keys** (por tenant o por usuario específico), **Webhooks**, **Logs de entrega**, **Documentación**. Confirma lo ya documentado: cualquier API Key activa sirve también para el MCP del tenant en `https://hub.redtec.ai/mcp` (header `x-user-api-key`).

### "Grupos" (WhatsApp) — por tenant, y vista global en "Grupos de WhatsApp" del nav

Instancia compartida de WhatsApp llamada **"RedtecBot"**. Cada grupo interno (donde el *staff* del cliente le consulta a Isabella/Walter, nunca un canal comercial) se asigna a un tenant desde un dropdown; sin asignar, el mensaje se descarta. Al 2026-09-22 había 13 grupos sin asignar y 9 ya asignados (incluye "RedTec <> Bravante" → Mundo Verde, "RedTec AI <> Grupo Althura" → Althura, "RedTec AI <> Constructora Rosero" → Rosero Construye, "RedTec AI <> CAP" → Desarrollos CAP, "RedTec <> Reynoso Bienes Raices" → Reynosobienesraices, 3 grupos internos de Garoo → Redtec AI, "Cofiño" → Cofiño).

### "Slack" (canal del equipo, por tenant)

Mismo espíritu que Grupos de WhatsApp: un canal adicional para que el agente responda consultas internas del *staff* del cliente, **nunca comercial**. Requiere una app de Slack instalada en el workspace del tenant (Bot Token `xoxb-...`, Signing Secret, Channel ID opcional — vacío escucha en cualquier canal donde esté invitado el bot).

### "Campañas Meta" (vista global) — atribución por tenant

Agrega conversaciones/citas/gasto por tenant en un rango de fechas. Al 2026-09-22, de los 12 tenants **solo Redtec AI tenía datos reales** (44 conversaciones, 2 citas, 500 US$ de gasto, campaña top "3 Marketplaces") — el resto en cero, confirmando que ningún cliente real tiene todavía Meta Ads conectado y atribuyendo de verdad.

### "Agente de soporte" (vista global) — el agente **Rita**, no Daniel

Sección que configura un agente separado, dentro del propio panel, llamado **Rita**: *"atiende dudas de admins de tenant sobre el CRM y crea tickets en Monday cuando detecta un problema real."* No confundir con Daniel — Rita vive **dentro** de crm.redtec.ai (widget de voz ElevenLabs embebido en el panel) y atiende a los *admins de tenant* sobre cómo usar el CRM; Daniel atiende a los clientes finales de RedTec (soporte post-venta) por Slack/WhatsApp. Configuración vista:
- **Widget (ElevenLabs)**: un `agent_id` de Rita, ya configurado y en uso.
- **Monday (tickets)**: token de API + Board ID `5092085472` — **el mismo tablero "Soporte y Emergencias" que usa Daniel** (confirma que ambos agentes, Rita y Daniel, crean tickets en el mismo board, solo que Rita atiende a admins de tenant y Daniel a clientes).
- **WebSocket de eventos en tiempo real**: canal único de toda la plataforma en `wss://hub.redtec.ai/realtime` — el servicio de soporte se conecta una sola vez y recibe eventos de TODOS los tenants (cada uno con su `tenantId` en el payload), autenticado con el secreto `SUPPORT_AGENT_WEBHOOK_SECRET`.

### "MCP Superadmin" (vista global)

Servidor MCP de solo lectura para superadmins: `https://hub.redtec.ai/mcp/admin` (header `x-user-api-key`). Tools: `list_tenants`, `get_tenant_config`, `get_container_logs`, `get_container_stats`. Sirve para diagnóstico cross-tenant (logs de contenedores, overview) sin tocar nada.

### Pagos (solicitudes de demo)

Pipeline de altas: **En checkout** → **Trial/tarjeta** → **Activada** / **Rechazada** / **Cancelada**. Al 2026-09-22 había 10 solicitudes históricas, 3 activadas (Mundo Verde, Desarrollos CAP, y "Hoteles" — esta última activada el 03-sept pero **no llegó a convertirse en un tenant real**, no aparece en la lista de 12 clientes). Confirma que "Hoteles Belize" (el cliente real, con agente en n8n) es un sistema totalmente aparte de este "Hoteles" que fue solo una demo de crm.redtec.ai que no prosperó — no confundir ambos.

### Usuarios y roles

4 roles del sistema, tal como los define el propio panel:
- **Superadmin**: acceso a la vista cross-tenant y a la configuración de cualquier tenant. Lista al 2026-09-22: Jordi Dimas, Aron (remoterep.com), Pedro Luzuriaga, Dilary Cruz, Jimmi Pachón, Jorge Calderón, Hugo Arias, Jorge Menzel, Fernando Ortiz — todos con email `@garooinc.com` o `@redtec.ai`.
- **Admin**: gestiona usuarios, configuración del agente, personalización e integraciones **de su propio tenant**.
- **Agente**: uso diario del CRM (Prospectos, Live Chat, Agenda) sin acceso a configuración ni gestión de usuarios.
- **Empleado**: acceso acotado a **"Mis tickets"** — recibe tickets de soporte que **Daniel** le asigna dentro de uno o más proyectos/tenants. **Este es el punto de integración confirmado entre Daniel y el CRM**: un ticket de soporte no solo vive en Monday, también puede aparecer dentro de crm.redtec.ai para el usuario "Empleado" al que Daniel se lo asignó.

**Notificaciones por tenant** (configurables, vistas en la sección Usuarios): Reporte diario (9:00 AM Guatemala: leads nuevos, funnel, Hot/Warm/Cold, sugerencias IA, inactivos, próximas citas), Reporte mensual (día 1, con Excel de todos los leads), "Clientes potenciales" al grupo de WhatsApp de staff (12:00 PM y 5:00 PM, solo aviso, no toca el CRM).

## Agentes de IA (roster)

Según la página comercial (redtec.ai): Sophie (Community Manager), Walter (Financial Analyst), Arturo (Legal Advisor), Isabella (Sales Assistant), Marco (Payments Agent), Daniel (Post-Sale Agent). En la operación real (Monday, fichas de agente) se usan así:

- **Isabella** — asesora comercial 1:1 (WhatsApp/Instagram/Messenger, vía ManyChat o webhook del tenant; opcionalmente voz con ElevenLabs). Producto estrella de CRM Realstate.
- **Sofía** — nombre de Isabella para Constructora Rosero. **Lucía** — nombre de Isabella para Reynoso Bienes Raíces. (No confundir con "Lucia", el E-Barista de El Injerto, que es un agente n8n.)
- **Sofi / Sophie** — community manager: responde comentarios de redes, captions, LinkedIn.
- **Sof-IA** — agente de Spectrum Vivienda (n8n) y su demo de voz (Telnyx).
- **Walter** — agente de staff en los grupos de WhatsApp de RedTec con cada cliente (Althura, Rosero, Reynoso, RedTec.ai); en RedTec.ai hace intake de demos y pasa a **Taylor** (arma la demo).
- **Arturo** — back-office de Bravante en el grupo «RedTec <> Bravante» (cotizaciones PDF, documentos, sync con Odoo).
- **Marco** — habilitado en Grupo Paz y Cofiño; sin uso documentado.
- **Dante** — auditor automático de calidad de conversaciones. Crea tickets "[Cliente — Agente] tipo — subtipo" (`hallucination`, `policy_violation`, `tool_misuse`) en "Soporte y Emergencias" y en el board "Dante QA — Hallazgos" (`5102626236`). Visto en vivo: es un 7º slot de agente dentro de crm.redtec.ai, activable por tenant — al 2026-09-22 solo estaba habilitado en el tenant "Redtec AI".
- **Daniel** — soporte (este agente). Visto en vivo: es también uno de los 6 agentes activables dentro de cada tenant de crm.redtec.ai (junto a Isabella/Sofi/Walter/Arturo/Marco) — hoy activo en Cofiño, Grupo Paz (configurado, tenant inactivo), Mundo Verde y Rosero Construye; **no activo** en Althura, Axis, Grupo SyG, Redtec AI, Reynosobienesraices, Desarrollos CAP, OKÜN Living ni Spectrum. Esto es aparte de dónde Daniel realmente opera hoy (Slack + WhatsApp de RedTec, ver `Agent-Support/Daniel-Agent/CLAUDE.md`) — el toggle en crm.redtec.ai es la integración nativa dentro del panel del cliente, no necesariamente la misma instancia/código.

## Equipo RedTec (por rol)

Asignado en AI Agent Ops el 2026-09-07:
- **Dirección / dueño de tableros:** Fernando Ortiz. **Coordinación con clientes:** Jorge Menzel.
- **AI Operations (calidad, drift, evals, hallazgos de Dante):** Hugo Arias, Pedro Luzuriaga.
- **Conversation Designer (tono, handoff, QA semanal):** Dilary Cruz.
- **Automatización / Dev (tools, webhooks, deploys, tenants nuevos):** Jorge Calderón, Jimmi Pachón.
- **Knowledge Manager:** sin asignar.

## Dónde viven los tickets

- Tablero real de soporte: **"Soporte y Emergencias"** (`5092085472`). Columna `text_mm5s75rw` = Cliente (texto libre, nombres inconsistentes — ver `monday_clientes`).
- El tablero viejo "Tickets de TI/soporte con IA" (`5101177200`) tiene solo pruebas de ago-2026 con respuestas inventadas: **no usarlo como fuente**.

## Plantilla "agente concierge" (n8n + ManyChat + MongoDB)

Usada por Hoteles Belize (agente base), El Injerto, El Convento y Wyndham Guatemala.

- **Workflows por cliente:** `<X>_PRINCIPAL` (orquestador, recibe el webhook), `<X>_KB_SEARCH` (RAG sobre MongoDB Atlas Vector Search), `<X>_NOTIFICATIONS` (correo de escalamiento por categoría), `<X>_Vectorizar KB` (manual, inactivo a propósito; se corre solo para recargar la KB), `<X>_ANALYTICS_SUMMARY` (cada 10 min resume conversaciones inactivas en una Google Sheet del cliente), `<X> - ERROR HANDLER` (correo al equipo de implementación).
- **Flujo:** mensaje en ManyChat (WhatsApp/Instagram/Messenger) o widget web → webhook `https://agentsprod.redtec.ai/webhook/<path>` → anti-spam en Redis → usuario e historial en Mongo → AI Agent (OpenRouter) con tools `kb_search` y `notifications` → respuesta por la API de ManyChat o por el widget.
- **Canal:** en ManyChat el cliente configura un paso "Solicitud externa" hacia el webhook y el custom field `canal_ingreso`.
- **Fallas recurrentes (para diagnóstico):**
  1. **`_id` de Mongo mal serializado** (`BSONError`, "input must be a 24 character hex string", o update que "sale bien" pero no guarda nada). Pasó tras un upgrade de n8n en Injerto, Convento, Belize, Spectrum y Mundo Verde; corregido en todos. Síntoma: el bot deja de responder a usuarios que vuelven a escribir, o no guarda su teléfono/email.
  2. **KB duplicada al re-vectorizar** (nodo de borrado desconectado). Corregido en Injerto, Convento y Belize.
  3. **"Escalé tu caso" sin escalar**: el modelo lo dice pero no llama la tool. Convento tiene una red de seguridad determinística.
  4. **Ventana de 24 h de Meta**: fuera de 24 h desde el último mensaje del usuario, Meta bloquea mensajes del negocio (error 3031). No es bug.
  5. `message_tag` ya no existe en la API de ManyChat → quitarlo del payload.
  6. Google Sheets 503 transitorio en ANALYTICS → hay reintento automático.
- **Reglas operativas:** n8n de producción es la fuente de verdad (los JSON de los repos son copias). Guardar ≠ publicar. Después de publicar un fix, **no usar "Retry"** sobre ejecuciones viejas (re-ejecutan la versión vieja): generar una ejecución nueva.

## Incidentes de infraestructura conocidos

- **Varios tenants de CRM Realstate dejan de responder a la vez** → causa conocida (2026-09-16, ticket `3226767832`): lock de Redis colgado en `redtec-realstate-api` porque LangSmith no tiene timeout al saturar cuota. Afecta a todos los tenants del mismo contenedor. Mitigación: desactivar tracing (`LANGCHAIN_TRACING_V2=false`) + reiniciar. **Escalar urgente.**
- OpenRouter sin crédito (HTTP 402) deja mudos a los agentes que lo usan (visto en Spectrum 2026-08-27).
- n8n 2.0 corre en servidor Hostinger con backup diario a Google Drive.
