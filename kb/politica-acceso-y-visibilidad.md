# Política de acceso y visibilidad de información para Daniel

> **Visibilidad: Interno (archivo completo).** Documento de gobierno de datos para el equipo de RedTec — nunca debe llegar a un canal de cliente.
>
> Objetivo: evitar que Daniel filtre información de un cliente a otro, o información interna de RedTec (métricas de uso, incidentes, seguridad, contactos, pricing) hacia cualquier canal de cara al cliente. Basado en prácticas estándar de aislamiento multi-tenant en RAG y de least-privilege para agentes de IA — ver fuentes al final. Esto es una propuesta para que Jorge la confirme/ajuste antes de tocar el esquema de Postgres o de reetiquetar los archivos ya escritos en `kb/`.

## Principio rector

**No confiar en el prompt para poner el límite.** Pedirle al modelo "no menciones a otros clientes" es la práctica que la industria identifica explícitamente como antipatrón — un LLM puede ignorarlo por un jailbreak, una alucinación, o simplemente porque el contexto se lo puso enfrente. El límite tiene que estar en la **consulta a la base de datos**, antes de que el contenido llegue al prompt: si una fila no pasa el filtro, Daniel nunca la ve, y por lo tanto no puede repetirla aunque se lo pidan con ingeniería social.

## 1. Clasificación de la información (4 niveles)

| Nivel | Qué incluye | Ejemplo en la KB actual |
|---|---|---|
| **Público** | Lo que cualquiera podría ver sin ser cliente ni empleado (existencia del producto, que hay demo de 15 días) | "redtec.ai ofrece una demo de 15 días" |
| **Cliente** (scoped a su propia `empresa`) | Todo lo operativo de ESE cliente sobre sí mismo: sus proyectos, sus precios/reglas de negocio, el estado de sus propios tickets, sus propios incidentes ya resueltos que le sirven de contexto | Enganche 20%/30% de Bravante, criterio de calificación de leads de CAP, proyectos de Althura |
| **Interno RedTec** | Todo lo que compara clientes entre sí, mide el negocio de RedTec, o expone cómo está construido el sistema | Las cifras "confirmado en vivo" de contactos/mensajes/modelo por tenant que junté hoy, notas de arquitectura (Mongo/n8n/CORS abierto), quién es el owner interno de cada cuenta, comparaciones entre tenants |
| **Secreto** | Nunca debe vivir en `documents` ni en `client_wiki` — va a un gestor de secretos aparte | Credenciales, API keys, la clave RSA de Itzana (hallazgo de seguridad ya reportado), tokens de ManyChat/Odoo |

Regla de contención: **Interno ⊇ Cliente(propio) ⊇ Público**, nunca al revés, y **ningún nivel puede ver el "Cliente" de otra empresa**. Es decir: internamente (Slack, panel superadmin) se puede ver todo; en el canal de un cliente solo se puede ver lo Público + lo Cliente de esa misma `empresa`; nunca lo Cliente de otra `empresa`.

## 2. Canales de Daniel y su nivel de confianza

| Canal | Cómo se identifica la `empresa`/nivel | Nivel de confianza |
|---|---|---|
| Grupo de WhatsApp del cliente (ej. "RedTec AI <> Grupo Althura") | `whatsapp_groups` / `monday_clientes` ya mapean el grupo a una `empresa` | Cliente, scoped a ESA `empresa` únicamente |
| Slack interno de RedTec | Canal interno del equipo | Interno (ve todo) |
| Widget/agente dentro de `crm.redtec.ai` (Daniel activado por tenant, o Rita) | El `tenant_id` del panel ya aísla la sesión | Cliente, scoped a ESE `tenant` únicamente — igual que WhatsApp, nunca debería poder preguntar "¿cómo le va a Mundo Verde?" y obtener respuesta |
| Comentarios en el tablero de Monday "Soporte y Emergencias" | El board es visible a los ~11 miembros del workspace, no es privado por ticket | Tratar como **Interno**, no como Cliente — si algún día un cliente tiene acceso de lectura al board, hay que revisarlo (queda como gap abierto abajo) |

Esto significa que la lógica de enrutamiento de canal → `empresa` que ya está pendiente en `kb/gaps-y-decisiones.md` (mapeos de `monday_clientes`) no es solo para poder avisar al cliente correcto — es también el mecanismo de seguridad. Sin ese mapeo resuelto, no hay forma de aplicar este filtro.

## 3. Cómo se aplica en el esquema real de Daniel

- **`client_wiki`**: agregar una columna `visibility` (`cliente` | `interno`) por sección o por página. Al leer para responder en el canal de la `empresa` X, la query es `WHERE empresa = X AND visibility <= nivel_del_canal` — nunca `WHERE empresa != X` filtrado después en el prompt.
- **`documents`** (FAQs por `producto`): agregar `visibility` (`publico` | `cliente` | `interno`) y, cuando aplique, restringir además por qué `producto`/tenant usa ese cliente (ej. una FAQ de facturación de Mundo Verde no debería ser recuperable desde el canal de Rosero Construye aunque ambas sean CRM Realstate).
- **Resolución de identidad de canal**: debe pasar ANTES del paso de retrieval (RAG), no después. El pool actual (una sola base Postgres/pgvector para todos los tenants) es válido — es el mismo patrón "Pool + tenant_id disciplinado + filtro obligatorio en cada query" que recomienda la industria — pero exige que **cada** función de tool/retrieval de Daniel reciba el `empresa`/canal como parámetro obligatorio, nunca opcional.
- **Nunca en la base de KB**: nada de lo que califica como "Secreto" (credenciales, tokens, claves) debe sembrarse en `documents`/`client_wiki` aunque esté marcado "interno" — eso ya es un problema de gestor de secretos, no de visibilidad de contenido (conecta con el hallazgo de la clave RSA de Itzana, que sigue sin resolverse).

## 4. Qué implica esto para los archivos ya escritos en `kb/`

Los archivos que armé hoy en la sesión en vivo **mezclan niveles dentro del mismo archivo** — por ejemplo `kb/clientes/mundo-verde.md` tiene en la misma página reglas de negocio que Bravante ya conoce de sí mismo (nivel Cliente) junto con las cifras de contactos/mensajes "confirmado en vivo" que son claramente comparación de negocio (nivel Interno, nunca debería salir en el grupo de WhatsApp de Bravante). Antes de sembrar cualquiera de estos archivos a Postgres hace falta pasarlos y etiquetar sección por sección, no archivo por archivo.

Propuesta concreta de bloques a marcar **Interno** dentro de lo ya escrito (no debería llegar jamás al canal del cliente correspondiente):
- Toda frase que empiece con "Confirmado en vivo (2026-09-22)" en los 12 tenants de `tenants-crm-realstate.md`, `mundo-verde.md`, `desarrollos-cap.md`, `spectrum.md` (cifras de contactos/mensajes/modelo — son datos de negocio de RedTec, no del cliente).
- Toda la sección de incidentes técnicos con detalle de arquitectura (bugs de Mongo, CORS abierto, credenciales en texto plano, nombres de tablas/columnas internas).
- Nombres de personas de RedTec (owners internos) — el cliente puede saber "vamos a escalarlo", no necesita el nombre interno de quién es el dueño de la cuenta puertas adentro salvo que ya sea su contacto conocido.
- Todo `kb/gaps-y-decisiones.md` completo (por diseño, es un doc interno de planeación) y el hallazgo de seguridad de la clave RSA.

Lo que sí puede quedar **Cliente** (respondible en el canal propio del cliente): proyectos, precios/reglas de negocio propias, criterios de calificación de leads, y resoluciones de incidentes ya resueltos que el cliente reportó él mismo (ej. "el bug del PDF de cotización con metros en 0 ya está corregido").

## 5. Gaps abiertos de esta política

1. **Falta decidir el mecanismo técnico exacto** (columna `visibility` + filtro SQL vs. tablas separadas `client_wiki_interno`/`client_wiki_cliente`) — recomendación de esta nota: una sola tabla con columna `visibility`, más simple de mantener que tablas espejo.
2. **Row Level Security de Postgres** como red de seguridad adicional (no solo el filtro en la query de la app) — recomendado por la industria como segunda capa, en caso de que algún tool nuevo olvide aplicar el filtro.
3. **Acceso del cliente al tablero de Monday**: confirmar si algún cliente tiene visibilidad de "Soporte y Emergencias" — si es así, cualquier nota interna que Daniel escriba ahí (o que el equipo escriba) debe tratarse como semi-pública, no interna.
4. **Retroetiquetado real de los ~10 archivos de `kb/clientes/*.md` y `kb/plataforma/redtec.md`** sección por sección — no hecho todavía, pendiente de que Jorge confirme esta taxonomía (Público/Cliente/Interno/Secreto) antes de invertir el tiempo en hacerlo, por si prefiere una taxonomía distinta (ej. más niveles, o distinta por canal de Monday).

## Fuentes consultadas (2026-09-22)

- [Multi-Tenant RAG Data Isolation: The 2026 Enterprise Architecture Guide — Truto](https://truto.one/blog/how-to-architect-strict-data-isolation-in-multi-tenant-rag-pipelines/)
- [How to Build a Multi-Tenant RAG for Customer Support — Actian](https://www.actian.com/blog/developer/how-to-build-a-multi-tenant-rag-for-customer-support/)
- [Designing Multi-Tenancy RAG with Milvus: Best Practices — Milvus Blog](https://milvus.io/blog/build-multi-tenancy-rag-with-milvus-best-practices-part-one.md)
- [Least Privilege Access for AI Agents — Cequence](https://www.cequence.ai/blog/ai/ai-agent-least-privilege-access/)
- [How to implement least privilege for AI agents — Okta](https://www.okta.com/identity-101/how-to-implement-least-privilege-for-ai-agents/)
- [Least privilege for AI agents: Identity, access, and tool binding — Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/07/16/least-privilege-for-ai-agents-identity-access-and-tool-binding/)
- [Role-Based Access Control for AI Data — FINOS AIR Governance Framework](https://air-governance-framework.finos.org/mitigations/mi-12_role-based-access-control-for-ai-data.html)
