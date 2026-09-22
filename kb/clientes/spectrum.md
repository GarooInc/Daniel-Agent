# Spectrum (`empresa`: `Spectrum` — ya existe en las tablas de Daniel)

> Único cliente con Agente Técnico asignado hoy (`@tecnico_spectrum`). Fuentes: `Agent-Spectrum/INDEX.md`, `Agent-Spectrum/CLAUDE.md`, `Agent-Spectrum/docs/estado_proyecto.md`, `Agent-Spectrum/docs/historial_fixes.md`, `TELNYX-Voice-Agent/*`, ficha "spectrum" y tickets de Monday.
>
> **Visibilidad por defecto: Cliente** (scoped a Spectrum). Las secciones/líneas marcadas **[INTERNO]** son detalle de arquitectura, diagnóstico técnico o cifras comparativas de negocio — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Spectrum Vivienda, inmobiliaria guatemalteca con 5 proyectos de **apartamentos**: Parque Vista Verde (PVV), Parque Mariscal (PMAR), Parque Portales (PPO), Parque Polanco (PPOL), Parque Sotobosque (PSB). No maneja casas ni jardín privado.

RedTec opera **dos agentes** para Spectrum:
1. **Sof-IA** (n8n, `agentsprod.redtec.ai`) — el chatbot comercial real y en producción. Captura y califica leads, responde sobre proyectos, agenda citas (RSVP), sincroniza al CRM Dynamics 365 del cliente.
2. Un **tenant nativo en CRM Realstate** (`crm.redtec.ai`, KB con 195 entradas) — provisionado pero la migración (interna "SPEC-A24") está **incompleta**; hoy el que atiende tráfico real es Sof-IA en n8n, no el tenant nativo. **[INTERNO] Confirmado en vivo (2026-09-22)**: el tenant nativo (agente "Sof-IA · anthropic/claude-sonnet-5") tiene apenas 8 contactos, 0 mensajes y 0 conversaciones activas — solo 1 de los 6 agentes del roster está activo. Esto confirma que el tráfico real de verdad pasa por n8n, no por acá.

## Sistemas y componentes (n8n) **[INTERNO]**

- `AGENT PRINCIPAL` — orquestador. Modelo `deepseek/deepseek-v4-pro` vía OpenRouter. Debounce en Redis (10 s). Anti-spam 15 msj/min + bloqueo en ManyChat.
- Tools: `Lead Collector` (nombre/email/teléfono → CRM), `KB SEARCH` (RAG en Atlas, filtra por `proyecto` en MAYÚSCULAS), `RSVP` (citas → colección `appointments`), `Send Media` (brochures/renders/videos).
- Programados: `Sync_CRM v2 (fase2 guard)` (cada ~10-15 min, SOAP a Dynamics 365), `Analytics Centralizado` (diario), `Health Check Conversaciones` (cada 6 h, alerta si no hubo conversaciones), `RECORDATORIOS` (seguimiento a no-leads de los 5 proyectos), `SEGUIMIENTO LEADS SIN CONVERTIR`.
- Otros: `Notifications Master` (correos de nuevo lead / precios / cita / escalación), `LEADS FASE 2 - RESUMEN en CRM`, `WEB FORM`, `Vectorizar los KBs` (manual).
- **Data Agent** (analítica interna del equipo de Spectrum, no cara al cliente final): `DataAgent - Core`, `- Mongo Query Tool`, `- Slack Trigger`, `- Weekly Summary`, postea a Slack `#data-agent`. Cuenta como producción: cualquier publicación necesita confirmación explícita igual que el resto.
- Canales: ManyChat en 6 páginas (una por proyecto + una interna de Garoo). Base de datos MongoDB Atlas `Centralizado`. CRM del cliente: Dynamics 365 vía SOAP (`Service.asmx`).
- RedTec Portal: dashboard, leads y reporte Fase 2 (`src/clients/Spectrum`).
- **Demo aparte:** agente de voz Sof-IA en Telnyx AI Assistants — ver sección propia más abajo. Tiene su propia base de datos, **no comparte datos con el chatbot real**.

## Cómo funciona

- **Gate obligatorio**: el bot no da información de proyectos ni agenda hasta capturar nombre + email + teléfono (`lead_collector` corre primero). No se debe debilitar esta regla (hubo un incidente el 2026-05-22 por hacerlo).
- Resolución de a qué proyecto se refiere el lead: en Instagram/Messenger, por `page_id` de la cuenta que escribió; en WhatsApp orgánico, por un menú ("Regla de Oro"); en WhatsApp Fase 2 (leads que vienen de la agencia Tribal), viene preseteado en `custom_fields.proyecto_interes`.
- **Fase 1** (tráfico orgánico) manda atribución completa (origen del chat, UTM source, campaña). **Fase 2** (Tribal) no pisa la atribución que ya trae el lead. Desde ~2026-07-20 el CRM del cliente exige el campo `_CampanaOrigen` en toda creación de lead.
- Campañas se detectan por keyword (ExpoCasa/QR "Activación", Picoteo/Feria, Mupis Miraflores). Existe un flujo "Descartados" que reactiva leads descartados con una plantilla de WhatsApp; si el lead toca un botón, se remarca como "Interesado".

## Incidentes conocidos y resolución (selección — ver `docs/historial_fixes.md` del repo para el detalle completo) **[INTERNO]**

- 2026-07-07: caída silenciosa del webhook (~11.5 h) → hubo que hacer unpublish/publish para re-registrarlo; leads huérfanos se pasaron manualmente a ventas. El Health Check tardó 6 h en alertar.
- 2026-07-22: leads orgánicos rechazados por el CRM quedaban marcados igual como "sincronizados" → se agregó un gate `IF CRM OK`.
- 2026-08-24: caracteres `&`/`<`/`>` en los resúmenes rompían el XML del SOAP → se agregó escape XML.
- 2026-08-24/26: timeouts de conexión a MongoDB Atlas en `KB SEARCH`.
- 2026-08-27: OpenRouter sin crédito (HTTP 402) dejó al bot sin responder → fallback pendiente de implementar.
- 2026-09-12: el modelo "alucinaba" `datos_completos:true` sin tener correo real → ahora se recalcula en código, no se confía en el LLM.
- 2026-09-14: bug de `_id` de Mongo en 7 nodos de 4 workflows → corregido. RSVP rechazaba fechas futuras válidas por un error de razonamiento del LLM → corregido.
- 2026-09-22: un candado distribuido en Redis por `manychat_id` causó un **apagón total del bot** en su primera prueba real → corregido el mismo día. Leads viejos de `users_fase_2` estaban pisando el proyecto de las campañas de Descartados → datos corregidos, causa de fondo sigue como incidente abierto (#50).
- **Abierto #42**: el web service del CRM de Spectrum responde éxito pero no persiste `_FechaCita`/`_TipoCita`/Origen al actualizar — reportado al proveedor (Spectrum TI), sin fix del lado de RedTec.
- **Abierto #49 (2026-09-22)**: el servidor que aloja el CRM SOAP de Spectrum está caído (timeout en todos los puertos, confirmado por Gerber/Spectrum) → `Sync_CRM v2` falla cada 10 min. Es infraestructura del cliente, sin ETA. **Si un cliente de Spectrum reporta "los leads no llegan al CRM", esta es la causa mientras el incidente siga abierto — verificar la fecha antes de asumir que sigue vigente.**

*(Excepción a la etiqueta [INTERNO] de esta sección: los hechos de #42/#49 — que el servidor del propio CRM de Spectrum está caído — sí pueden decirse directamente a Spectrum, es infraestructura de ellos mismos. Lo que no debe salir en su canal es el detalle interno de `Sync_CRM v2`/nombres de workflows.)*

## Escalamiento **[INTERNO]**

- Dirección comercial de Spectrum (aprobaciones de tráfico/campañas).
- QA/administración del CRM del lado de Spectrum.
- Marketing (URLs de campaña).
- Responsable del web service SOAP del CRM (Spectrum TI) — para el incidente #42/#49.
- Técnico RedTec: implementador de Sof-IA (Jorge Calderón).
- **Agente Técnico** `@tecnico_spectrum` por Slack, canal privado `tecnico-spectrum` — ver nota abajo.

## Estado actual (2026-09-22)

En producción. CRM del cliente caído (esperando que Spectrum levante el servidor). Reactivación masiva de la campaña "Descartados" pausada esperando el flujo de ManyChat. Hay un plan diseñado (no construido) de panel de administración de KB dentro del RedTec Portal.

## Nota sobre el Agente Técnico (Hermes Agent) **[INTERNO]**

Instancia de Hermes Agent (Nous Research) desplegada en el VPS de Daniel. Comunicación solo por Slack — el Técnico debe mencionar explícitamente `@Daniel-Soporte` en su respuesta final para que Daniel la tome como diagnóstico. Timeout de 15 min (mientras tanto Daniel avisa "seguimos investigando" al cliente). Tiene acceso MCP de **solo lectura** al n8n compartido; su alcance hoy está acotado a los 4 workflows del Data Agent de Spectrum.

## Sof-IA — agente de voz (demo, Telnyx) **[INTERNO]**

Fuentes: `TELNYX-Voice-Agent/README.md`, `TELNYX-Voice-Agent/ESTADO-PROYECTO.md`, `TELNYX-Voice-Agent/docs/runbook-incidentes.md`.

- Demo de canal de voz sobre **Telnyx AI Assistants** (asistente "SPECTRUM: VOICE AGENT"). Lógica en n8n, proyecto "TELNYX VOICE AGENT": `TelVoAg - SUPPORT` (consulta cliente/crea ticket/escala), `TelVoAg - RSVP` (agenda: consultar/reservar/reprogramar/cancelar), `TelVoAg - LEADS` (calificación, callback, no-llamar). LLM `deepseek/deepseek-v4-flash`. Conoce los 5 proyectos. **Base de datos propia, no comparte datos con el chatbot real de Spectrum.**
- Escalamiento asíncrono por Slack `#telnyx-voice-agent` + registro en Mongo `escalations`; el asistente nunca dice "le transfiero" (no hay transferencia en vivo).
- **Runbook / kill switch**: en el portal de Telnyx, cambiar el webhook de la aplicación del número para enrutar directo a humanos. Si falla una tool, revisar el Error Trigger de n8n y hacer rollback de versión.
- **Estado (2026-08-16)**: fases 0-3 cerradas, primera llamada real exitosa de punta a punta. Número de pruebas es +1 (EE.UU.); producción real requeriría un número +502. Pendiente: probar la regla de "menos información por turno"; los owners del runbook todavía no están nombrados.
