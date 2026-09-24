# Grupo Althura (`empresa`: `Grupo Althura`)

> Tenant `althura`, prefijo `alst_`, en `crm.redtec.ai` (Isabella/Sofía). Cuenca, Ecuador. Fuente:
> Monday (ficha KB-Clientes-RedTec-Sep2026), complementado con una sesión en vivo como superadmin
> en crm.redtec.ai el 2026-09-22 (cifras marcadas "confirmado en vivo"). Separado el 2026-09-24 de
> `kb/clientes/tenants-crm-realstate.md` (mezclaba varios tenants en un solo archivo, ver
> `kb/gaps-y-decisiones.md`). **No existe todavía en las tablas de Daniel** (`whatsapp_groups`/
> `tech_agents`/`monday_clientes`).
>
> **Visibilidad por defecto: Cliente** (scoped a Grupo Althura). Las secciones/líneas marcadas
> **[INTERNO]** son cifras comparativas o notas de operación de RedTec — nunca deben responderse
> en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

- **Estado**: Live en CRM Realstate (migrado; el sistema legacy quedó apagado y su base de datos archivada).
- **Agentes**: Isabella (ventas) + Walter (staff en el grupo de WhatsApp "RedTec AI <> Grupo Althura"). Canales: ManyChat WhatsApp/Instagram/Messenger. KB con 149 entradas.
- **Proyectos**: Condominio **Rumihurco** (preventa de casas) y **Suites Spot** (suites/departamentos/locales; precios en suitespot.grupoalthura.com).
- **Reglas de negocio**: prioriza agendar visita al showroom (también admite visita virtual); **nunca agenda llamadas telefónicas** — si el prospecto pide una llamada, Isabella responde que un asesor lo va a contactar (ninguna llamada agendada por el bot había sido atendida). El correo **no es obligatorio** para agendar. Trato de "usted", sin markdown en WhatsApp. Fuera de alcance: preventas BIESS VIP de Rumihurco, administración de Airbnb (Althura Host), proveedores, postulantes a empleo (se redirige a grupoalthura.com/jobs).
- **Oficina real**: Jean Moliere SN y Fernán Caballero, Cuenca — hubo un bug donde Isabella daba la ubicación de Rumihurco en vez de la oficina; corregido.
- **Contactos del cliente**: Thalia Jara (asesora).

## Ops RedTec **[INTERNO]**

Owner: Pedro Luzuriaga.

## Incidentes / solicitudes recurrentes **[INTERNO]**

Latencia (necesitaba 2 mensajes para responder, corregido); contestaba con emojis a historias de Instagram (corregido); las alertas de "sin respuesta" y el resumen diario saturaban el correo/chat interno → se desactivaron esos dos flags; falta implementar bien el handoff humano (tras timeout del bot, activar chat con asesor y desactivar el bot cuando el asesor escribe); no se podía crear un lead con contrato firmado si no tenía fecha de visita (el CRM la exige); el asunto de los correos de cita sigue el formato `PROYECTO | TIPO DE CITA - NOMBRE DEL PROSPECTO`; hallazgos de Dante por alucinación/mal uso de tools.

## Confirmado en vivo (2026-09-22) **[INTERNO]**

1372 contactos, modelo `anthropic/claude-sonnet-4-6`, 1 conversación activa, 274 mensajes ese día — el segundo tenant más activo de la plataforma. Solo 2/6 agentes del roster activos (Isabella, Walter).
