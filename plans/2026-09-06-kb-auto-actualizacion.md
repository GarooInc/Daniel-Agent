# Base de conocimiento auto-actualizada (Agente Técnico + tickets + grupos/canales)

**[SUPERADO 2026-09-07 para la fuente del Agente Técnico]** — Jorge planteó el problema real de fondo (Daniel no debería tener que consultar al Técnico en vivo cada vez, debería tener su propio conocimiento por cliente) y eso llevó a adoptar el patrón "LLM Wiki" de Karpathy en vez de vectorizar snippets aislados. Ver `plans/2026-09-07-client-wiki.md` para el diseño e implementación vigentes de esa fuente. Las secciones de este documento sobre **tickets** y **grupos/canales** (todavía no implementadas) siguen vigentes tal cual — no se tocaron.

## Contexto

Jorge pidió que Daniel mantenga su propia base de conocimiento (`documents`, la tabla que usa `buscar_faqs`) actualizada sola, alimentada por 3 fuentes:
1. Info que le llega de los Agentes Técnicos (diagnósticos reales de n8n de clientes).
2. Info de grupos/canales (Slack, y el canal de WhatsApp nuevo — ver `plans/2026-09-06-canal-whatsapp-evolution-api.md`).
3. Info de tickets (resolución de un ticket de soporte).

**Esto retoma una discusión ya cerrada una vez (2026-08-27, ver `ESTADO-PROYECTO.md`)**: Jorge preguntó algo parecido (reemplazar el RAG por algo que Daniel mantuviera solo) y la conclusión de esa sesión fue no tocar nada — el punto señalado como riesgoso era específicamente que el LLM edite la base de conocimiento **sin supervisión**, porque rompe la regla central del proyecto de que el LLM nunca es la fuente de verdad de algo no confirmado por una herramienta o un humano (misma clase de bug que motivó la extracción determinística de datos de ticket). La recomendación de esa sesión, si se retomaba, era "Daniel propone, humano aprueba".

## Decisión de Jorge (2026-09-06)

Al retomar el tema hoy, Jorge decidió explícitamente **no** ir por la cola de aprobación humana — quiere que sea automático — pero acotado: **"debe comprobar que sea real y confiable antes"**. Al precisar qué significa eso (AskUserQuestion), la decisión quedó:

**Daniel auto-escribe la base de conocimiento SOLO cuando el dato viene de una fuente ya estructurada/verificada por un sistema real — nunca desde texto suelto de un grupo/canal (alguien especulando, un cliente quejándose, un técnico charlando informalmente).** Texto de grupos/canales, si acaso, queda señalado para revisión humana — nunca se auto-escribe.

Esto reconcilia el pedido de "automático" con la regla ya establecida: no es el LLM juzgando por su cuenta si algo "suena confiable" (eso repetiría el mismo riesgo del 27/08, solo que automatizado) — es la fuente misma la que ya pasó por una verificación real antes de llegarle a Daniel.

### Fuentes elegibles para auto-escritura (ya estructuradas/verificadas)

- **Agente Técnico**: `tech_agent_handoffs.causa_raiz` / `componente_afectado` (ya existen en Postgres, `integrations/postgres/tech-agent-handoff.ts`) — vienen de auditar el n8n real de un cliente vía Hermes, extraídos determinísticamente por `agent/extract-tech-diagnosis.ts`. Ya son un dato confirmado contra un sistema real, no una opinión.
- **Tickets**: la resolución final de un ticket de soporte, escrita por un humano. Candidato de columna en el tablero de producción de Monday: **"Criterio de Cierre"** (`text_mm5sxfxg`, ver memoria `reference_monday_boards.md`) — **sin confirmar que se use consistentemente** (hay tickets recientes con columnas vacías, ver la misma memoria). Daniel hoy no lee ese campo en ningún lado — habría que agregar una lectura vía GraphQL cuando el ticket pasa a "Done" (mismo momento que ya dispara el aviso proactivo al cliente, `ticket-status-handler.ts`/`monday-webhook-handler.ts`).

### Fuente NO elegible para auto-escritura

- **Grupos/canales** (Slack, WhatsApp): texto de conversación cruda. Nunca se auto-escribe en `documents`. Si se quiere aprovechar igual, la única vía consistente con la regla de arriba sería una cola de revisión humana aparte (ej. una sección nueva en Support-Agent-Panel) — **no diseñado todavía, fuera de alcance de esta primera pasada**.

## Preguntas abiertas antes de escribir código (no asumir)

1. **¿Está "Criterio de Cierre" realmente poblado en la práctica?** La memoria de Monday ya advierte que varios tickets recientes tienen columnas en null. Si nadie lo llena, esta fuente queda vacía en la práctica — confirmar con Jorge/el equipo de soporte antes de construir sobre este campo.
2. **Disparador**: ¿cuándo corre esto? Candidatos: (a) cuando un handoff del Agente Técnico pasa a `answered` (ya hay un evento claro, `markHandoffAnswered`); (b) cuando un ticket pasa a `Done` (ya hay un webhook, `ticket-status-handler.ts`/`monday-webhook-handler.ts`); (c) un batch periódico que revise ambas fuentes (mismo patrón que `faq-embedding-sync.ts`, `setInterval` cada N minutos).
3. **Formato de destino**: ¿siempre crea una FAQ nueva en `documents`, o puede actualizar una existente si el tema ya está cubierto? Sin una respuesta a esto, un problema recurrente genera FAQs duplicadas sin límite.
4. **Quién arma la pregunta/respuesta real**: `causa_raiz`/`componente_afectado` (o el texto de "Criterio de Cierre") no vienen en formato pregunta/respuesta — hace falta una transformación (probablemente una llamada LLM aparte, mismo patrón que `extract-ticket-fields.ts`/`extract-tech-diagnosis.ts`) para convertirlos en un `pregunta`/`respuesta` legible antes de insertar.
5. **`producto`/`categoria`/`tags`**: ¿quién los asigna en la fila nueva? Necesarios para que `buscar_faqs` los use como filtro (ver `documents.producto_idx`).
6. **Recalculo de embedding**: ya resuelto en general — `faq-embedding-sync.ts` reembede toda la tabla cada 60s, alcanzaría igual para filas nuevas insertadas por este mecanismo, sin cambios ahí.
7. **Salvaguarda mínima antes de activar esto en producción**: dado que sigue siendo escritura automática (aunque desde fuentes verificadas), vale la pena decidir si hace falta algún límite operativo — ej. un tope de FAQs auto-creadas por día, o un log/aviso a `#escalacion` cada vez que se auto-crea una (para que el equipo se entere sin tener que revisar la tabla a mano) — a confirmar con Jorge, no asumir que no hace falta ningún control.

## Estado

**[IMPLEMENTADO 2026-09-07] Fuente del Agente Técnico — de punta a punta, incluyendo el scoping por cliente.** Durante el diseño surgió un punto no obvio, resuelto con Jorge antes de codear (`AskUserQuestion`): `documents` (la tabla de `buscar_faqs`) solo filtraba por `producto`, nunca por cliente — un diagnóstico del Agente Técnico es casi siempre específico de la implementación de UN cliente, así que auto-insertarlo sin scope filtraría ese detalle a cualquier otro cliente con una pregunta parecida. Decisión de Jorge: agregar `empresa` a `documents` (NULL = FAQ general, como hoy; un valor = solo visible para ese cliente).

- **`schema.ts`**: columna `empresa` nueva en `documents` + índice. Primer caso del repo donde hace falta `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` en vez de `CREATE TABLE IF NOT EXISTS` (la tabla ya existe en producción) — documentado inline para que el próximo caso similar no tenga que redescubrir el problema.
- **`extract-tech-diagnosis.ts`**: `DiagnosisSchema` suma `faqPregunta`/`faqRespuesta` opcionales (generalizados, sin nombres de cliente) — se piden en la MISMA llamada al LLM que ya hacía `deliverTechDiagnosis`, no una consulta aparte.
- **`agent/tech-diagnosis-to-faq.ts`** (nuevo): `saveDiagnosisAsFaq(handoff, diagnosis)`. Regla de seguridad central: si no se puede resolver `empresa` del cliente (perfil incompleto), **no guarda nada** — mejor no generar la FAQ que generarla sin scope. `producto` sale del perfil del cliente (fallback `"Otro"` si no es uno de los valores válidos, mismo patrón que `auto-escalate.ts`). `id` determinístico (`auto-tech-{threadTs}`) — upsert idempotente si `deliverTechDiagnosis` se reintentara.
- **`deliver-tech-diagnosis.ts`**: llama a `saveDiagnosisAsFaq` best-effort al final, mismo patrón que el resto de sus efectos secundarios (nunca bloquea ni rompe la entrega al cliente).
- **`documents.ts`/`search-faqs.ts`/`tools/index.ts`/`daniel.ts`**: `searchFaqsBySimilarity` y la tool `buscar_faqs` (ahora `createSearchFaqsTool(empresa)`, factory en vez de tool estática) filtran por `empresa IS NULL OR empresa = $empresa` — `daniel.ts` le pasa `profile?.empresa` resuelto.
- Type-check limpio, 95/95 tests verdes (6 nuevos: `tech-diagnosis-to-faq.test.ts` completo + casos nuevos en `search-faqs.test.ts`/`deliver-tech-diagnosis.test.ts`).
- **Sin deployar todavía** — código en el working tree, no commiteado. Sin correr `npm run build` en producción, el `ALTER TABLE` no se aplica.

**Sin resolver, deliberadamente fuera de esta pasada**: la fuente de tickets (bloqueada en confirmar si "Criterio de Cierre" se usa consistentemente) y grupos/canales (nunca auto-escribe, cola de revisión humana sin diseñar). Ver preguntas 1 y 7 de arriba, siguen abiertas.
