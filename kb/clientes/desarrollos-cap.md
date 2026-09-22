# Desarrollos CAP (`empresa` propuesta: `Desarrollos CAP`)

> Alias: CAP, `desarrolloscap` (tenant_id 14). **No existe todavía en las tablas de Daniel** — de hecho Daniel figura en este tenant como "Agente en preparación": `ask_daniel`/`create_daniel_ticket` todavía no funcionan para CAP. Fuentes: `Agent-CAP/README.md`, `Agent-CAP/docs/STATUS.md`, `Agent-CAP/docs/ARQUITECTURA.md`, `Agent-CAP/docs/DECISIONES.md`.
>
> **Visibilidad por defecto: Cliente** (scoped a Desarrollos CAP). Las líneas marcadas **[INTERNO]** son detalle de arquitectura o cifras comparativas de negocio — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Desarrolladora inmobiliaria guatemalteca. Tenant `desarrolloscap` en **CRM Realstate** (`crm.redtec.ai`), con **Isabella** como agente comercial por WhatsApp. Proyectos: RÚA Doce (entrega prevista finales de 2028), RÚA Castellana, Hacienda Las Margaritas (KB casi vacía todavía). CRM externo de destino: **Pipedrive**.

## Sistemas y componentes

- Panel `crm.redtec.ai` con las secciones: Knowledge Base, CRM, Campañas, Configuración.
- **[INTERNO]** Webhook del tenant: `hub.redtec.ai/api/webhook/desarrolloscap`. Modelo `deepseek/deepseek-v4.1-flash` vía OpenRouter.
- **[INTERNO]** Integración a Pipedrive vía n8n: workflow `CRM - TOOL` (carpeta CAP, `POST /webhook/pipedrive-cap`), con un AI Agent que decide qué crear/actualizar usando 11 tools nativas de Pipedrive. La llamada llega firmada con HMAC-SHA256 y se verifica.
- **[INTERNO]** Plan de la cuenta: `demo` (sin Stripe todavía).

## Cómo funciona

Ver las FAQs generales de Isabella / CRM Realstate en `kb/faqs-candidatas.md`. Criterio de calificación de un lead, en orden: tiempo de entrega esperado → ubicación → tipologías de interés → si es para vivir o para invertir → precio. Los precios de RÚA Doce están cargados por rango de tipología (actualizado 2026-09-22).

## Incidentes / hallazgos

- El puente hacia el CRM (Pipedrive) estaba **desactivado en el panel** — por eso nunca había tráfico llegando. Se activó y se confirmó "Conexión exitosa".
- **[INTERNO]** Hay 2 webhooks generales duplicados con 0 entregas registradas, sin diagnosticar todavía.
- **[INTERNO] Gotcha de KB**: una entrada manual vieja de un proyecto ("PENDIENTE — no inventar") puede quedar activa a la vez que la ficha nueva (`project:N`) del mismo proyecto — el agente recibe datos contradictorios. Al cargar la ficha nueva de un proyecto, hay que desactivar la entrada manual vieja.
- **[INTERNO]** El "Sales Coach" generó un texto genérico de B2B/SaaS sin contexto inmobiliario — el prompt necesita revisión.
- 2026-09-22: una asesora humana hace seguimiento manual por el **mismo número de WhatsApp** que usa Isabella — riesgo de que se pisen las respuestas.

## Escalamiento **[INTERNO]**

Aprovisionamiento/backend de redtec.ai → responsable de plataforma en Garoo. Coordinación con el cliente → PM de cuenta en Garoo (Jorge Menzel, por el patrón general de la plataforma).

## Estado actual

WhatsApp funcionando con leads reales. Pendiente probar de punta a punta `find_property`/`link_lead` con un lead real. Hacienda Las Margaritas todavía sin ficha de proyecto cargada.

**[INTERNO] Confirmado en vivo (2026-09-22)**: tenant activo, agente Isabella sobre `deepseek/deepseek-v4.1-flash`, 3 contactos, 1 conversación activa, 6 mensajes ese día — tráfico real pero bajo volumen. Solo 2/6 agentes del roster activos (Isabella, Walter); **Daniel no está activo en este tenant**, consistente con lo ya documentado ("Agente en preparación").
