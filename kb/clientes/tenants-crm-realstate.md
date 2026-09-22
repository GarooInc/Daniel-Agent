# Otros tenants de CRM Realstate (Isabella / Sofía / Lucía)

> Clientes provisionados en `crm.redtec.ai` sin repo propio en Garoo. Base: Monday (ficha KB-Clientes-RedTec-Sep2026, PDF del 2026-09-08, y fichas de identidad por tenant), **complementado con una sesión en vivo como superadmin en crm.redtec.ai el 2026-09-22** (cifras de contactos/modelo/agentes activos marcadas "confirmado en vivo").
>
> **⚠️ Nota estructural**: este archivo mezcla **varios tenants distintos en un solo documento**. Antes de sembrar `client_wiki` hay que partirlo en una página por `empresa` — nunca cargar este archivo completo bajo una sola `empresa`, porque expondría a cada tenant la información de los demás. Mientras tanto: **visibilidad por defecto de cada sección = Cliente, scoped SOLO a esa empresa**; las líneas marcadas **[INTERNO]** (cifras "confirmado en vivo", nombres de owners de RedTec, comparaciones entre tenants) nunca deben salir en el canal de ningún tenant. Ver `kb/politica-acceso-y-visibilidad.md`.

## Grupo Althura (Cuenca, Ecuador) — tenant `althura`, prefijo `alst_`

- **Estado**: Live en CRM Realstate (migrado; el sistema legacy quedó apagado y su base de datos archivada).
- **Agentes**: Isabella (ventas) + Walter (staff en el grupo de WhatsApp "RedTec AI <> Grupo Althura"). Canales: ManyChat WhatsApp/Instagram/Messenger. KB con 149 entradas.
- **Proyectos**: Condominio **Rumihurco** (preventa de casas) y **Suites Spot** (suites/departamentos/locales; precios en suitespot.grupoalthura.com).
- **Reglas de negocio**: prioriza agendar visita al showroom (también admite visita virtual); **nunca agenda llamadas telefónicas** — si el prospecto pide una llamada, Isabella responde que un asesor lo va a contactar (ninguna llamada agendada por el bot había sido atendida). El correo **no es obligatorio** para agendar. Trato de "usted", sin markdown en WhatsApp. Fuera de alcance: preventas BIESS VIP de Rumihurco, administración de Airbnb (Althura Host), proveedores, postulantes a empleo (se redirige a grupoalthura.com/jobs).
- **Oficina real**: Jean Moliere SN y Fernán Caballero, Cuenca — hubo un bug donde Isabella daba la ubicación de Rumihurco en vez de la oficina; corregido.
- **Contactos del cliente**: Thalia Jara (asesora). **[INTERNO]** Ops RedTec: Pedro Luzuriaga.
- **[INTERNO] Incidentes / solicitudes recurrentes**: latencia (necesitaba 2 mensajes para responder, corregido); contestaba con emojis a historias de Instagram (corregido); las alertas de "sin respuesta" y el resumen diario saturaban el correo/chat interno → se desactivaron esos dos flags; falta implementar bien el handoff humano (tras timeout del bot, activar chat con asesor y desactivar el bot cuando el asesor escribe); no se podía crear un lead con contrato firmado si no tenía fecha de visita (el CRM la exige); el asunto de los correos de cita sigue el formato `PROYECTO | TIPO DE CITA - NOMBRE DEL PROSPECTO`; hallazgos de Dante por alucinación/mal uso de tools.
- **[INTERNO] Confirmado en vivo (2026-09-22)**: 1372 contactos, modelo `anthropic/claude-sonnet-4-6`, 1 conversación activa, 274 mensajes ese día — el segundo tenant más activo de la plataforma. Solo 2/6 agentes del roster activos (Isabella, Walter).

## Constructora Rosero / Rosero Construye (Ecuador) — tenant `rosero`, prefijo `rs_`

- **Estado**: Live desde la migración del 2026-09-01.
- **Agentes**: Sofía (ventas 1:1 por WhatsApp/ManyChat), Walter (staff), Sofi (comentarios de redes/captions). KB con 263 entradas, sincronizada con Monday.
- **Proyectos**: **MAWA** y **LUZ** (estudio/suite/2 habitaciones). En LUZ ya no se deben ofrecer suites en pisos altos con vista.
- **Reglas**: trato de "usted", sin presión comercial, una pregunta de calificación por turno; **no preguntar directamente si es para inversión o para vivir** (se retiró esa pregunta); los prospectos no se auto-agendan citas (`disable_prospect_booking=true`, se derivan a asesores); guardia anti-comercial activa (`non_commercial_guard_enabled=true`).
- **[INTERNO] Ops RedTec**: Hugo Arias. Grupo de WhatsApp: "RedTec AI <> Constructora Rosero".
- **[INTERNO] Incidentes / solicitudes**: pausar a Sofía cuando un asesor responde desde la app nativa de Facebook/Instagram/WhatsApp (resuelto); no mandar followups automáticos si el asesor ya está conversando con el prospecto (resuelto); bloquear leads duplicados por teléfono o email (resuelto); agregar el proyecto **Credicasa** a la KB; alucinaciones al hablar de avances de obra; no se podía crear un contacto manualmente y el correo de notificación mostraba el número en vez del nombre del lead (corregido); Sofi debía responder también comentarios de Facebook (resuelto); restaurar el origen de un lead; pedido de métricas de Meta por pieza/campaña; reporte de leads reasignados tras la baja de un asesor.
- **[INTERNO] Nota de mapeo**: un ticket real llegó al tablero de soporte de Daniel con la columna "Cliente" vacía (solo el nombre "Rosero Construye" en el título) — Daniel no pudo avisar por WhatsApp porque `monday_clientes` no tiene ese mapeo. Falta agregarlo.
- **[INTERNO] Confirmado en vivo (2026-09-22)**: agente "Sofia" sobre `anthropic/claude-sonnet-4-6`, 1636 contactos, 6 conversaciones activas simultáneas, 225 mensajes ese día — el tenant con más actividad concurrente de toda la plataforma. Los 6 agentes del roster están activos (Isabella/Sofia, Sofi, Walter, Arturo, Daniel, Marco).

## RedTec.ai (tenant interno) — `redtecai`, prefijo `redte_`

Tenant de demos y ventas de la propia plataforma. Isabella vende "AI Employees" (también por voz, ElevenLabs); Walter hace el intake de demos y pasa a Taylor, que las arma (`provisionTenant`); Sofi/Sophie llevan lo social/LinkedIn; Dante audita. Stripe está en modo TEST. Sincroniza a **GoHighLevel**. KB con 84 entradas. Regla: solo debe hablar de los agentes del roster oficial y no navega redtec.ai en vivo (responde solo desde su KB). **[INTERNO]** Owner: Hugo Arias.

**[INTERNO] Confirmado en vivo (2026-09-22)**: 257 contactos, modelo `anthropic/claude-sonnet-5`, 70 mensajes ese día, llamadas salientes activadas (ON) — el único tenant con **7 agentes** en vez de 6 (incluye a Dante activo), 5/7 activos.

## Reynoso Bienes Raíces (Salta, Argentina) — `reynosobienesraices`, prefijo `rbr_`

Provisionado, con tráfico bajo todavía. Agente **Lucía** (+ Walter, Sofi). ManyChat configurado. KB con 91 entradas (~62 son listados de propiedades). Pendiente: integrar el inventario de Odoo (parte de la fase de habilitación de Isabella). **[INTERNO]** Grupo de WhatsApp "RedTec <> Reynoso Bienes Raices". Owner: Hugo Arias. Su integración con Odoo va por un workflow de n8n (`CRM - TOOL`, carpeta REYNOSO): mismo patrón que Desarrollos CAP (webhook del tenant + agente de IA que decide + tools del CRM en flujos separados).

**[INTERNO] Confirmado en vivo (2026-09-22)**: modelo `anthropic/claude-sonnet-5`, **6022 contactos** (con diferencia, el tenant con más contactos de toda la plataforma — cruza con los ~62 listados de propiedades del PDF de Monday, así que la mayoría son prospectos/leads, no listados), 0 mensajes ese día, 3/6 agentes activos.

## Grupo Cofiño — `grupocof`, prefijo `gc_`

Provisionado, KB cargada (179 entradas, ~186 SKUs). Isabella habilitada, junto con Marco/Arturo/Walter/Daniel/Sofi en el roster (sin más detalle de para qué se usa cada uno acá). ManyChat vacío todavía. **Sin documentación adicional** sobre qué sistema opera RedTec para este cliente más allá del tenant. **[INTERNO]** Owner: Fernando Ortiz. Un hallazgo de Dante por alucinación registrado.

**[INTERNO] Confirmado en vivo (2026-09-22)**: modelo `anthropic/claude-sonnet-5`, 23 contactos, 0 mensajes ese día, llamadas salientes activadas (ON) — junto con Mundo Verde y Rosero Construye, es de los pocos tenants con **los 6 agentes del roster activos** al mismo tiempo (Isabella, Sofi, Walter, Arturo, Daniel, Marco).

## Grupo Paz — `grupopaz`, prefijo `gp_`

Provisionado, volumen casi nulo (KB con 1 entrada, ~0 leads, 12 mensajes). ManyChat vacío. Marco también aparece habilitado en el roster de este tenant.

**[INTERNO] Confirmado en vivo (2026-09-22)**: el tenant en sí figura **Inactivo** (aunque los 6 agentes del roster están configurados) — 1 contacto, 1 Google Calendar conectado. El panel indica explícito: *"Para activar el agente falta configurar el LLM y el token de ManyChat"*. Si llega un ticket de Grupo Paz, es probablemente sobre completar este setup, no sobre un fallo en producción. Esta última frase (el diagnóstico de qué falta) sí puede decirse tal cual al propio cliente — es Cliente-facing; lo que debe quedar Interno son las cifras exactas de contactos y el estado comparado con otros tenants.

## Grupo SyG (Chile/Argentina) — `gruposyg`, prefijo `grupo_`

En onboarding. Isabella habilitada, pero con un **rol distinto al resto**: da soporte a los asistentes de un evento (expo/congreso), no hace preventa comercial. ManyChat vía webhook propio. KB sembrada (10 entradas), pendiente de generar embeddings y de configurar las llaves del LLM. **[INTERNO]** Owner: Jimmi Pachón.

**[INTERNO] Confirmado en vivo (2026-09-22)**: ya tiene modelo asignado (`google/gemini-3.8-flash`, distinto a Anthropic) y el tenant figura Activo — 9 contactos, 6 mensajes ese día. Solo 2/6 agentes activos (Isabella, Walter).

## Axis — tenant nuevo

**[INTERNO]** Alta el 2026-09-18, prioridad Critical, owner Jimmi Pachón. Solo hay un checklist de implementación de Isabella de septiembre 2026 — sin más datos operativos todavía.

**[INTERNO] Confirmado en vivo (2026-09-22)**: modelo `google/gemini-3.8-flash`, tenant Activo, 4 contactos, 49 mensajes ese día (volumen alto para solo 4 contactos — probablemente pruebas internas). Solo 1/6 agentes activo (Isabella).

## Archgroup y Hoteles — ya no existen como tenants **[INTERNO]**

Según el PDF de Monday de septiembre existían como tenants vacíos ("shells", ids 11 y 12). **Confirmado en vivo (2026-09-22): ninguno de los dos aparece ya en la lista de 12 tenants reales** — Archgroup parece haberse disuelto (sus usuarios, con dominio `archg.net`, quedaron reasignados al tenant "Redtec AI"); "Hoteles" tampoco existe como tenant, aunque sí hay una solicitud de demo activada a nombre de "Hoteles" el 2026-09-03 en la sección Pagos — no llegó a convertirse en un tenant real, y **no tiene relación con Hoteles Belize** (el cliente real de Itz'ana/Ka'ana, que opera aparte con un agente en n8n, ver `kb/clientes/hoteles-belize.md`). Ver también OKÜN Living (Grupo VEQ) en `kb/clientes/okun-living.md`, un tenant nuevo no visto antes en ningún otro sistema.
