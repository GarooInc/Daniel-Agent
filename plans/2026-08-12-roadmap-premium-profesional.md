# Roadmap: de v1 funcional a agente premium/profesional

Fecha: 2026-08-12. Autor: evaluación pedida por Jorge, hecha con Claude Code repasando `ESTADO-PROYECTO.md`, `NOTAS-INICIALES.md`, el código en `src/` y el plan de realtime (`2026-08-06-redtec-realtime-websocket.md`).

## Por qué existe este archivo

No es un plan de una feature puntual — es una foto de **qué falta para pasar de "v1 que funciona bien en dogfooding interno" a "producto premium confiable con clientes externos reales"**. Sirve para llevarlo al equipo (Jorge lidera Daniel) y convertir los ítems en tareas del board de Monday o de donde se trackee el trabajo. Se commitea al repo (no solo queda en el chat) siguiendo la misma convención que `plans/2026-08-06-redtec-realtime-websocket.md`: que se pueda retomar/consultar desde cualquier máquina.

## Diagnóstico en una frase

El concepto y la ingeniería de v1 son sólidos — el loop resolver/escalar funciona, con mecanismos reales (no parches de prompt) para los problemas difíciles de estos agentes (memoria, tool-calling confiable). Lo que falta para "premium" no es más código de agente, es **contenido real, madurez operativa (CI/staging/observabilidad) y expansión de canal/alcance**.

---

## Prioridad 0 — Bloqueante antes de exponer Daniel a clientes externos reales

### 1. Reemplazar la KB y los datos de cliente de ejemplo por los reales
**Por qué es P0**: hoy Daniel responde con 16 FAQs y 7 clientes inventados. Mientras eso no cambie, cualquier despliegue a clientes reales es una demo, no un producto.
**Qué implica**:
- Conseguir contenido real de FAQs de Isabella/Sofi/widget-chatbot (quién lo escribe/aprueba — probablemente no es tarea de ingeniería sola, necesita al equipo de producto/soporte de RedTec).
- Migrar `customers.json` a una colección Mongo real conectada a la fuente de verdad de cuentas/suscripciones (ya está anotado como pendiente en `ESTADO-PROYECTO.md`).
- Re-correr `migrate:faqs` con el contenido real y recalibrar el umbral de similarity search (ver ítem 6) contra preguntas reales, no las 2 pruebas manuales de hoy.
**Esfuerzo**: bajo en código (el pipeline de migración ya existe y es idempotente), alto en coordinación/contenido. Depende de gente fuera de ingeniería.
**Dueño sugerido**: Jorge coordina con producto/soporte de RedTec para el contenido; el trabajo técnico es ~1 día.

### 2. CI básico (GitHub Actions)
**Por qué es P0**: hoy no existe `.github/workflows/`. Los 44 tests y `tsc --noEmit` solo corren si alguien se acuerda de correrlos a mano. El historial del proyecto ya tiene varios bugs de producción que un CI no habría prevenido, pero sí habría evitado que un push rompiera type-check o tests sin que nadie lo note hasta el deploy.
**Qué implica**: un workflow simple en cada push/PR — `npm ci`, `npx tsc --noEmit`, `npm test`. No requiere secrets de producción (los tests ya usan mocks para Mongo/OpenRouter/Monday).
**Esfuerzo**: pequeño, medio día.

### 3. Cerrar los cabos de seguridad ya identificados y no resueltos
Estos ya están documentados en `ESTADO-PROYECTO.md` como "pendiente de revisar" o "cabo suelto" — no son nuevos hallazgos, es cerrarlos:
- Tildar "Use Docker Build Secrets" en Coolify (hoy los secrets, incluido `REDIS_URL`, quedan horneados como `ARG` de Docker visibles en el historial de capas de la imagen).
- Terminar la rotación del Bot Token de Slack (`xoxb-...`) que quedó a medias durante la investigación del "fantasma" — desinstalar y reinstalar la app de cero para forzar un token nuevo, o confirmar explícitamente por qué no hace falta.
**Esfuerzo**: pequeño, ~1-2 horas de trabajo + verificación.

---

## Prioridad 1 — Madurez operativa (lo que separa "funciona" de "confiable")

### 4. Observabilidad de negocio, no solo logs técnicos
**Por qué**: hoy la única forma de saber cómo está funcionando Daniel es leer logs de Coolify a mano. No hay forma de responder "¿cuántos tickets escaló esta semana?", "¿qué producto genera más consultas?", "¿cuánto tarda en responder en promedio?" sin hacer queries manuales a Mongo.
**Qué implica** (de menor a mayor esfuerzo):
- Mínimo: un query/script contra Mongo (`chat_histories`, `ticket_drafts` resueltos, colección de tickets creados) que arme un resumen semanal.
- Medio: loggear eventos de negocio estructurados (ticket creado, escalación automática disparada, FAQ sin match) a una colección propia `agent_events`, separada de los logs técnicos de pino.
- Completo: un dashboard simple (aunque sea una página interna con Mongo Charts o un artifact que lea de la colección de eventos).
**Esfuerzo**: 1-3 días según el nivel que se elija. Recomiendo arrancar por el mínimo (script de resumen semanal) antes de invertir en dashboard.

### 5. Ambiente de staging separado de producción
**Por qué**: varios de los bugs más serios documentados (tickets duplicados, la "instancia fantasma", datos mezclados entre sesiones) se depuraron en vivo contra Slack real y Monday real de producción. Aceptable en dogfooding interno tolerante a fricción; no aceptable con clientes externos pagando.
**Qué implica**: segunda app en Slack (workspace de pruebas o canal dedicado), segundo board o vista filtrable en Monday, base de Mongo separada (`DanielSoporteStaging`) — reusa toda la infra ya construida, solo credenciales distintas.
**Esfuerzo**: medio, ~1 día de setup, después es gratis (se usa en cada cambio grande).

### 6. Calibrar el umbral de similarity search de FAQs con uso real
**Por qué**: el umbral actual (0.72) se ajustó con dos pruebas manuales, no con volumen real de preguntas de clientes. Un umbral mal calibrado significa FAQs correctas descartadas (Daniel dice "no encontré nada" innecesariamente) o FAQs irrelevantes coladas.
**Qué implica**: una vez haya conversaciones reales, revisar los scores de `buscar_faqs` en los logs y ajustar. Depende de tener tráfico real primero (viene después del ítem 1).
**Esfuerzo**: pequeño, pero requiere volumen de uso real antes de poder hacerlo bien.

---

## Prioridad 2 — Expansión de producto (lo que falta para el alcance completo)

### 7. Segundo canal: widget web o WhatsApp
El roadmap original (`NOTAS-INICIALES.md`) definía Slack → widget web → WhatsApp. Solo Slack existe, y Slack es el canal de dogfooding interno, no necesariamente el canal del cliente final de RedTec. La arquitectura de `channels/` ya está pensada para esto (agregar una carpeta nueva sin tocar el resto), y el trabajo de debounce/cola con Redis ya se hizo pensando explícitamente en WhatsApp.
**Esfuerzo**: mediano-grande (varios días), pero la base técnica reduce el riesgo — es la razón por la que se construyó channel-agnostic desde el principio.

### 8. Seguimiento de tickets ya escalados
Cliente pregunta "¿cómo va mi ticket?" — hoy no hay integración bidireccional con Monday para esto (documentado como fase 2 desde el diseño original).
**Esfuerzo**: mediano, requiere leer estado de Monday (la integración GraphQL ya existe, es agregar una query) y una forma de que el cliente referencie su ticket (número, o buscar por email/conversación).

### 9. Soporte interno del equipo (fase 2 original)
Requiere una segunda forma de identificar al interlocutor (empleado de RedTec vs. cliente externo) y probablemente una KB distinta (procesos internos). Explícitamente fuera de alcance de v1 desde el diseño inicial — no es urgente, pero es parte del alcance completo de "Daniel" tal como se concibió.

### 10. Exponer los eventos de CRM del realtime (leads/citas)
El código de `crm-events-cache.ts` ya cachea `lead.*`/`appointment.*` en Mongo, pero no hay tool que los exponga porque falta el mapeo tenant→cliente-de-Slack. Bloqueado hasta que ese mapeo exista en el codebase (probablemente junto con el ítem 1, cuando se conecten datos reales de cliente).

---

## Cómo lo leería un equipo que no vivió esta sesión

- **P0 (1, 2, 3)**: son la diferencia entre "demo pulida" y "producto real". Sin esto, cualquier cliente externo real que use Daniel está hablando con datos inventados, sin red de seguridad de CI, con secrets mal manejados.
- **P1 (4, 5, 6)**: son la diferencia entre "funciona hoy" y "vamos a poder confiar en esto a medida que crece" — nada de esto bloquea usar Daniel ahora, pero sin esto cada incidente futuro se debug a ciegas como los de agosto.
- **P2 (7-10)**: es completar el producto tal como se diseñó originalmente, no urgencias — trabajo de roadmap normal.

Sugerencia concreta: llevar P0 al board de Monday esta semana (son items chicos y de alto impacto), y usar este archivo como referencia para decidir con el equipo el orden de P2 según qué canal/feature tiene más presión de negocio ahora mismo.
