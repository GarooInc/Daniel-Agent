# Base de conocimiento técnica por cliente ("LLM Wiki" de Karpathy, adaptado a Postgres)

## Contexto

Retoma `plans/2026-09-06-kb-auto-actualizacion.md`, específicamente la fuente del Agente Técnico — la implementación de ayer (`tech-diagnosis-to-faq.ts`, insertar cada diagnóstico como una fila aislada en `documents`, scopeada por `empresa`) quedó revertida sin commitear. Jorge planteó el problema real que motiva este cambio: no quiere que Daniel tenga que consultarle al Agente Técnico cómo funciona el sistema de un cliente cada vez que le preguntan algo — quiere que Daniel **tenga** ese conocimiento (por cliente) y solo recurra al Técnico en vivo como último recurso (no entiende el pedido, su conocimiento está desactualizado, o el cliente reporta algo nuevo).

Se investigó el ["LLM Wiki" pattern de Karpathy](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an) (gist con 5K+ stars): en vez de RAG clásico (vectorizar todo, buscar por similitud en cada consulta), un agente **compila** cada fuente nueva una sola vez, al llegar, fusionándola en una página existente — no la apila. Separa storage (canónico, legible, versionable) de search (índice derivado y descartable). Coincide con el skill ya instalado `karpathy-llm-wiki`, aunque ese skill asume archivos en disco gestionados interactivamente por un humano — acá hace falta la versión que se actualiza sola, en runtime, sin humano en el loop (Jorge decidió esto el 2026-09-06: automático, sin cola de aprobación, pero solo desde fuentes ya verificadas).

## Por qué esto y no seguir vectorizando

| | FAQs generales (Isabella/Sofi/etc.) | Conocimiento del sistema de UN cliente |
|---|---|---|
| ¿Se sabe de antemano a quién le vas a contestar? | No | **Sí** — Daniel ya resuelve `empresa` determinísticamente antes de responder |
| Forma natural del conocimiento | Muchos pares P/R independientes | Un documento coherente que crece y se corrige con el tiempo |
| ¿Hace falta buscar por similitud? | Sí | **No** — lectura directa por `empresa`, sin embeddings |

Vectorizar snippets aislados por cliente (lo que se revirtió) iba a acumular fragmentos redundantes sin que nada los consolidara — el mismo "ruido" que ya preocupaba desde el 27/08. El patrón Karpathy resuelve esto de raíz: cada diagnóstico nuevo se **fusiona**, no se apila.

## Decisión de granularidad

**Una página por `empresa`, sin subdividir por "sistema".** Hoy la arquitectura ya es 1:1 (una fila de `tech_agents` por cliente, un Agente Técnico por cliente) — no hay ningún dato real que sugiera cómo subdividir más. Si algún día hace falta, se extiende la clave con casos reales para guiarlo, no de antemano. Distintos componentes/workflows del mismo cliente son secciones de markdown dentro de la misma página, no filas nuevas.

## Diseño

**Storage: Postgres, no archivos en disco** — el contenedor de Daniel es stateless (ya se descartó una vez, 27/08, exactamente por esto), así que la "página" vive en una tabla, no en un `.md`.

- **Capa "raw" (inmutable)**: ya existe, es `tech_agent_handoffs` (`causa_raiz`, `componente_afectado`, `respuesta_cruda`, `created_at`) — no se duplica en una tabla nueva.
- **Capa "wiki" (compilada)**: tabla nueva `client_wiki` — `empresa` (PK), `contenido` (TEXT, markdown), `fuentes` (TEXT[], los `thread_ts` que fundamentan el contenido actual — grounding, como el campo "Raw" del wiki original), `updated_at`.
- **Sin tabla de índice ni de log aparte** — un `SELECT empresa, updated_at FROM client_wiki` ya da el índice gratis, y pino (mismo patrón que el resto del proyecto) ya cubre el log.

**Compilación (fusión, no append)**: en el mismo momento donde ya se resuelve un diagnóstico (`deliverTechDiagnosis`, cuando `causaRaiz`/`componenteAfectado` vienen concretos):
1. Leer `client_wiki.contenido` de esa `empresa` (o un scaffold de secciones si es la primera vez).
2. Una llamada al LLM: página actual + diagnóstico nuevo → página completa actualizada, con la misma regla de fundamento del skill (solo datos que estén en el diagnóstico o ya en la página, nunca inventar — coincide con la regla central del proyecto).
3. Guardar el resultado completo, acumular la fuente nueva sin duplicar.

**Regla de seguridad**: si no se puede resolver `empresa` del cliente (perfil incompleto), no se toca la wiki — mejor no actualizar que actualizar la página equivocada.

## Implementado (2026-09-07)

- `schema.ts`: tabla `client_wiki`.
- `integrations/postgres/client-wiki.ts`: `getClientWiki()`/`saveClientWiki()`, sin caché (no es camino caliente de cada mensaje).
- `agent/compile-client-wiki.ts`: `compileClientWikiFromDiagnosis()` — la fusión vía LLM.
- `agent/deliver-tech-diagnosis.ts`: llama a lo anterior best-effort (resuelve `empresa` vía `getCustomerProfile`, no bloquea ni rompe la entrega al cliente si falla).
- Type-check limpio, 95/95 tests verdes (10 nuevos: `compile-client-wiki.test.ts` completo + 3 casos nuevos en `deliver-tech-diagnosis.test.ts`).
- **Sin deployar** — en el working tree, sin commitear.

## Sin resolver todavía (siguiente paso)

**El lado de LECTURA — cómo y cuándo Daniel consulta esta página al responder.** Dos formas, con trade-offs distintos de tokens/latencia/confiabilidad, sin decidir todavía:
1. **Tool nueva** (`consultar_conocimiento_cliente`, que el modelo elige llamar) — más control, pero depende de que el modelo decida llamarla (mismo riesgo de confiabilidad que ya motivó sacar cosas del criterio del modelo en este proyecto, ej. el ruteo del Agente Técnico).
2. **Inyección automática en el prompt** (como `buildKnownDataNote`/`techAgentConfig` hoy) cuando se conoce la `empresa` — determinístico, cero riesgo de que el modelo "se olvide" de consultarlo, pero mete la página completa en cada mensaje aunque no haga falta (choca con el objetivo explícito de Jorge de minimizar tokens).

También sin resolver: cuándo exactamente Daniel decide escalar al Técnico en vivo en vez de confiar en la página (desactualizada / no cubre el caso / el modelo no entiende) — y las fuentes de tickets/grupos-canales del plan original (`2026-09-06-kb-auto-actualizacion.md`), que siguen sin tocar.
