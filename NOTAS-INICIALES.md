# Daniel — Agente de Soporte de RedTec

Notas de arranque del proyecto. Fecha: 2026-07-27.

## Contexto: iniciativa de "dogfooding" en RedTec

Resumen de reunión (Impromptu Google Meet, 27 julio 2026):
Recording: https://fathom.video/share/VxsBSfG5UnMt3GvJooeCogXX4qcfjyFV

**Propósito de la reunión:** Alinear al equipo en el uso de nuestros propios productos para escalar las operaciones internas.

**El problema:** Red Tec no utiliza sus propios productos (Isabella, Daniel, Sofi), lo que genera una brecha crítica de credibilidad de cara a los clientes y un soporte interno ineficiente.

**La solución:** Desplegar Isabella para ventas, Daniel para soporte y Sofi para marketing, y crear un nuevo agente de QA, "Dante", para pruebas sistemáticas.

### Los cuatro agentes

- **Isabella (Ventas)** — Líder: Hugo Arias. Agendar citas y prospectar leads generados por la agencia de marketing HoldMe. Flujo: Meta Ads → Isabella → Marcos (Ventas) cierra el trato. Prioridad: próximo viaje a Argentina.
- **Daniel (Soporte)** — Líder: Jorge Calderón (yo). Resolver las consultas de los clientes y escalar los problemas a un tablero de soporte en Monday.
- **Sofi (Marketing)** — Líder: Pedro Luzuriaga. Publicar contenido y generar ideas de contenido (p. ej. carruseles de LinkedIn). Jimmy apoya con investigación de tendencias tecnológicas. Jorge Menzel entrega las claves de redes sociales a Pedro.
- **Dante (QA/Testing)** — Líder: Pedro Luzuriaga. Probar sistemáticamente los productos para encontrar errores silenciosos antes de que se conviertan en problemas críticos (p. ej. pérdida de backups de más de 5 días). Arquitectura: agente local (Llama/Qwen) orquestado con CrewAI en una Mac Mini, separado del VPS principal.

### Próximos pasos (del resumen de reunión)

- Hugo Arias: liderar el despliegue de Isabella, priorizando el próximo viaje a Argentina.
- Jorge Calderón: liderar el despliegue de Daniel para soporte interno.
- Pedro Luzuriaga: liderar el despliegue de Sofi y construir a Dante.
- Jimmy: apoyar a Pedro con investigación de tendencias tecnológicas para Sofi.
- Jorge Menzel: entregar claves de acceso a redes sociales de RedTec a Pedro.

## Diseño inicial de Daniel (sketch en pizarra)

Flujo propuesto:

1. Admin panel y WA (WhatsApp) — puntos de entrada/canales.
2. El cliente resolviendo duda o notifica.
3. Agente actualiza.
4. Agente escala y crea ticket.
5. Ticket en MONDAY.

**Función de Daniel:** resolver las consultas de los clientes directamente cuando pueda, y escalar a un ticket en Monday.com cuando no pueda resolverlas.

## Tareas de Daniel (definido 2026-07-28)

Daniel atenderá tanto a clientes externos de RedTec como al equipo interno, pero se decidió acotar el alcance de la v1 a clientes externos para lanzar rápido un loop funcional, dejando el soporte interno para fase 2.

### V1 — Alcance inicial (clientes externos)

**1. Atención directa (resuelve sin escalar)**
- FAQs de producto: dudas de uso, configuración, funcionalidades de los productos RedTec (Isabella, Sofi, widget-chatbot, etc.)
- Estado de cuenta/servicio: consultar suscripción, estado de un servicio contratado, facturación básica
- Primer diagnóstico de errores (bug triage): pedir detalles/pasos de reproducción, distinguir si es error de configuración del usuario o un bug real antes de decidir escalar

**2. Decisión de escalación**
- Criterios para escalar: no hay respuesta en la base de conocimiento, bug confirmado, cliente pide hablar con humano, urgencia/severidad alta
- Crear ticket en Monday.com con: resumen del problema, quién es el cliente, canal de origen (WA/admin panel), prioridad, qué se intentó ya
- Notificar al cliente que se escaló y dar expectativa de tiempo de respuesta

**3. Gestión de conversación**
- Identificar canal de entrada (WhatsApp vs admin panel) y mantener contexto entre mensajes
- Identificar al cliente (quién es, qué producto usa) para dar respuestas relevantes

**4. Base de conocimiento (para desarrollo)**
- Como no existe todavía la real, crear una base de conocimiento ficticia (FAQs de ejemplo + datos de cliente de prueba) para construir y probar el flujo antes de tener la real

### Fase 2 (backlog, no entra en v1)
- Consultas internas del equipo (procesos, herramientas, políticas internas de RedTec) — requiere una segunda forma de identificar interlocutor
- Seguimiento de tickets ya escalados (cliente pregunta "¿cómo va mi ticket?") y cierre del loop (avisar cuando se resuelve) — requiere integración bidireccional con Monday

## Canales — orden de implementación (definido 2026-07-28)

Se ajusta el sketch inicial (que proponía Admin panel + WhatsApp desde el arranque) a un rollout incremental por canal:

1. **Slack** — primer canal a implementar. Aquí se construye y valida el loop completo (resolver / escalar a Monday) antes de exponerlo a más canales.
2. **Widget web** — una vez Slack esté funcional, se construye un widget embebible para integrar en cualquier sitio web.
3. **Demás canales** (WhatsApp, admin panel, etc.) — se agregan después, una vez que el flujo ya esté probado en Slack y widget.

## Stack técnico (definido 2026-07-28)

- **Backend**: Node.js + TypeScript
- **Framework HTTP**: Express
- **Canal Slack**: `@slack/bolt` (SDK oficial) en Socket Mode
- **Orquestación del agente**: LangChain.js — maneja el loop de tool-calling (decidir resolver vs. escalar) y da acceso al ecosistema de integraciones pre-hechas más grande de la comunidad JS/TS, priorizado sobre Mastra por esa razón
- **LLM**: vía **OpenRouter** (no la API directa de Anthropic) — permite cambiar de modelo sin reescribir el código de integración
- **Persistencia v1**: archivos JSON simples — FAQs/datos de cliente ficticios como base de conocimiento, conversación en memoria
- **Escalación**: API de Monday.com para crear el ticket

## Credenciales (definido 2026-07-28)

Guardadas en `.env` (gitignored; ver `.env.example` para la plantilla): `OPENROUTER_API_KEY`, `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `MONDAY_API_TOKEN`.

## Tablero de Monday (definido 2026-07-28)

- **URL**: `redtechai.monday.com/boards/5101177200`
- **Board ID**: `5101177200`
- Creado a partir de la plantilla "Soporte/procesamiento de tickets" (Tickets de TI/soporte con IA), con 2 columnas agregadas manualmente para cubrir lo que necesita Daniel.
- **Columnas clave para la integración** (id → título → tipo):
  - `name` → Nombre
  - `text` → E-mail
  - `text1` → Solicitud (resumen del problema)
  - `status6` → Urgencia (prioridad)
  - `status4` → Tipo de solicitud
  - `status2` → Estado
  - `color_mm5p5k5s` → **Canal de origen** (agregada — Slack/Widget/WhatsApp)
  - `long_text_mm5per1v` → **Qué se intentó ya** (agregada, long_text)
- Columnas de la plantilla que no se usan por ahora (traducción automática, sentimiento, TL:DR, tiempos de respuesta) se dejaron sin tocar — no estorban y podrían servir en fase 2.
- Acceso verificado vía API GraphQL de Monday (`api.monday.com/v2`) usando `MONDAY_API_TOKEN` — no hay conector MCP de Monday disponible en esta sesión, así que la integración real será directo a la API GraphQL.

## Estado actual

Proyecto recién creado, sin código todavía. Tareas de v1, stack técnico, credenciales y tablero de Monday ya definidos (ver arriba). Primer canal a construir: Slack. Pendiente: empezar a construir el proyecto (scaffolding Node + TS + Express + LangChain.js).
