# Gaps, decisiones pendientes y hallazgos — compilación de KB para Daniel (2026-09-22)

> **Visibilidad: Interno (archivo completo).** Documento de planeación para el equipo de RedTec — nunca debe llegar a un canal de cliente. Ver `kb/politica-acceso-y-visibilidad.md`.
>
> Compilado a partir de: Monday (solo lectura), los repos locales de Garoo (solo lectura), y una **sesión en vivo como superadmin en crm.redtec.ai el 2026-09-22** (actualizado tras esa sesión). Nada de esto se cargó todavía a Postgres — son archivos markdown en `kb/` para revisar antes de sembrar `documents`/`client_wiki`.

## ⚠️ Hallazgo de seguridad — no relacionado con la KB, pero urgente

El documento de Monday **"Itzana - Backend"** (doc `6372982`, objeto `5086981869`) tiene, en texto plano, una **clave privada RSA completa y la IP del servidor backend**, visible para todo el workspace de Monday (11 miembros). También existen documentos titulados "DB Credentials" y "Credenciales Netsuite" que no se abrieron. **Recomendación: rotar esa clave y esas credenciales, y moverlas a un gestor de secretos**, independientemente de esta tarea de KB.

## Decisiones que necesitan que Jorge las tome antes de sembrar la base de datos

1. **✅ [RESUELTO 2026-09-24] Nombres canónicos de `empresa` para los clientes nuevos.** Jorge aprobó tal cual los nombres usados en `kb/clientes/*.md`: El Injerto, El Convento, Wyndham Guatemala, Hoteles Belize, Desarrollos CAP, OKÜN Living (Grupo VEQ), Grupo Althura, Constructora Rosero, Reynoso Bienes Raíces, Grupo Cofiño, Grupo Paz, Grupo SyG, Axis, RNR, Mundo Verde. Ninguno existe todavía en `whatsapp_groups`/`tech_agents`/`monday_clientes` de Daniel excepto RNR y Mundo Verde.
2. **✅ [RESUELTO 2026-09-24] Hoteles Belize: una sola `empresa`.** Jorge confirmó "Hoteles Belize" con secciones internas por propiedad (Itz'ana/Ka'ana) — ver `kb/clientes/hoteles-belize.md`.
3. **✅ [RESUELTO 2026-09-24] Relación Bravante ↔ Mundo Verde.** Jorge confirmó fusionar bajo `empresa = Mundo Verde` mientras se confirma la relación exacta con el cliente/Fernando — ver `kb/clientes/mundo-verde.md`.
4. **Cómo va a leer Daniel el `client_wiki`.** Ya resuelto desde antes de esta compilación: inyección automática en el prompt cuando se conoce la `empresa`, en producción desde el 2026-09-08 (ver `plans/2026-09-07-client-wiki.md`, ESTADO-PROYECTO.md sesión del 2026-09-08). Aplica igual al contenido nuevo de esta compilación, sin cambios de código adicionales para esto.
5. **Reemplazo de `faqs.json`.** Las FAQs actuales son ficticias y contradicen la plataforma real (ver `kb/faqs-candidatas.md`). **[IMPLEMENTADO 2026-09-24]**: `src/data/faqs.json` reemplazado por las 38 filas de `kb/faqs-candidatas.md`, con la columna `visibilidad` llevada al schema (`documents.visibilidad`, filtrada en `searchFaqsBySimilarity` — las FAQs `interno` nunca se devuelven a la tool `buscar_faqs`). La distinción `publico`/`cliente` queda solo documental por ahora: ninguna fila de esos dos tipos es específica de un cliente puntual (son genéricas de la plataforma crm.redtec.ai), así que no hay filtro por `empresa` que aplicarles todavía.
6. **Política de acceso y visibilidad (qué puede ver cada canal/cliente).** Propuesta completa en `kb/politica-acceso-y-visibilidad.md` (taxonomía Público/Cliente/Interno/Secreto, filtrado por `empresa`/canal en la query, nunca en el prompt). Confirmada por Jorge el 2026-09-22 ("ok avancemos"). **[CERRADO 2026-09-24]**:
   - (a) `kb/clientes/tenants-crm-realstate.md` se partió en 7 páginas por tenant (`grupo-althura.md`, `constructora-rosero.md`, `reynoso-bienes-raices.md`, `grupo-cofino.md`, `grupo-paz.md`, `grupo-syg.md`, `axis.md`) más `kb/clientes/tenants-crm-realstate.md` quedó como nota interna (RedTec.ai/Archgroup, ninguno es cliente real a sembrar). `kb/clientes/rnr-y-otros.md` se partió en `kb/clientes/rnr.md` (el único `client_wiki` real) y `kb/inventario-clientes-menores.md` (interno, no sembrar).
   - (b) mecanismo técnico real implementado, no solo textual: `integrations/postgres/client-wiki.ts#stripInternalContent` saca de forma determinística (nunca dejando que el LLM se autocensure) las secciones/líneas marcadas **[INTERNO]** antes de que `daniel.ts` inyecte el `client_wiki` en el prompt — con test unitario (`client-wiki.test.ts`). **Limitación conocida**: no separa una marca [INTERNO] a mitad de línea junto a un dato seguro en el mismo bullet — al escribir client_wiki, poner cada dato en su propia línea.

## `monday_clientes` — mapeos nuevos propuestos

La columna "Cliente" de Monday (`text_mm5s75rw`) usa texto libre e inconsistente. Antes de que Daniel pueda avisar por WhatsApp a estos clientes cuando cambie el estado de un ticket, hace falta un `INSERT` en `monday_clientes` por cada variante de texto vista:

| Texto visto en Monday | `empresa` propuesta |
|---|---|
| "Rosero Construye" | `Constructora Rosero` |
| "Bravante (Mundo Verde)" / "Mundo Verde / Bravante" | `Mundo Verde` (pendiente de la decisión #3 de arriba) |
| "Grupo Althura" / "Althura" | `Grupo Althura` |
| "El Injerto (Garu)" | `El Injerto` |
| "redtecai" (pedidos internos de Fernando sobre otros clientes) | no mapear — es un valor interno, no un cliente real |

## Gaps de información — dónde falta profundizar

1. **Fichas de tenant no leídas en Monday.** El board `5103725883` tiene, por cada tenant de CRM Realstate, fichas PDF de Persona/Knowledge/Tools/Flujo/Esquema/Seguridad/Calidad/Go-live — solo se leyeron las de "Identidad" de Althura, Rosero, Spectrum y RedTec.ai. Probablemente tienen el detalle más útil para completar `client_wiki` de esos tenants.
2. **~110 tickets viejos de "Soporte y Emergencias"** (anteriores a agosto 2026) solo tienen título, sin descripción ni cliente asignado. No se leyeron los comentarios ("updates") de ningún ticket — ahí probablemente están las resoluciones concretas de los que figuran "Done".
3. **✅ Resuelto en gran parte (2026-09-22)**: se hizo login real como superadmin y se recorrió la Sala de control completa (los 12 tenants, Agente de soporte/Rita, Grupos de WhatsApp, Campañas Meta, MCP Superadmin, Pagos, Usuarios/roles) — ver `kb/plataforma/redtec.md`, sección "crm.redtec.ai — estructura del panel". **Sigue faltando**: la vista de administrador de un tenant específico ("Entrar como admin" — Dashboard, CRM/Pipeline, Live Chat, Agenda, Cotizaciones, Knowledge Base del lado del cliente) no se abrió en esta pasada por no ser necesaria para el objetivo de esta sesión; las filas 🔲 de `kb/faqs-candidatas.md` que dependen de esa vista siguen sin confirmar. `Agent-CAP/docs/STATUS.md` tiene una auditoría de esa vista específica para Desarrollos CAP del 2026-09-21.
4. **Sin documentación de sistema más allá de lo confirmado en vivo (modelo/contactos/agentes activos)**: Cofiño, Grupo Paz, Grupo SyG, Reynoso, Axis, OKÜN Living (Grupo VEQ). RNR (qué automatización opera RedTec para ellos, si alguna, más allá de los módulos del Portal), Pepsi, Ficohsa y Guatecompras (solo aparecen como nombres de módulo del Portal, sin detalle de cómo funcionan).
5. **Sofi/Sophie (community manager) y el widget-chatbot genérico**: no hay ningún repo o ficha que documente cómo funcionan en la práctica — todo lo que hay es el nombre en un roster.
6. **Planes y precios de redtec.ai**: nada documentado más allá de "hay una demo de 15 días" y que Desarrollos CAP está en plan "demo, sin Stripe".
7. **Matriz de contactos de escalamiento por rol del lado RedTec**: los repos nombran personas sueltas, pero no existe una tabla oficial de "quién es el owner de cada cliente". El runbook de Telnyx directamente dice que sus owners están "pendientes de nombrar".
8. **Agent-ADS** (Meta Ads AI Media Buyer) es solo planificación — nada construido todavía, no es material de soporte.

## Datos con fecha de vencimiento (revisar antes de dar por vigentes)

- Spectrum, incidente **#42** (el CRM no persiste `_FechaCita`/`_TipoCita`) y **#49** (servidor del CRM del cliente caído, 2026-09-22) y **#50** (causa de fondo de leads viejos pisando campañas) — confirmar si siguen abiertos antes de repetirlos como estado actual.
- Bravante, fecha de entrega: el PDF de KB de Monday (2026-09-08) dice "~2027"; los tickets de agosto 2026 dicen "mayo 2028" — se usó 2028 en `kb/clientes/mundo-verde.md` por ser la fuente más reciente, pero conviene confirmarlo con el cliente.
- Desarrollos CAP: "Hacienda Las Margaritas sin ficha" y "seguimiento manual por el mismo número de WhatsApp de Isabella" son estado al 2026-09-22 — revisar si ya se resolvieron.
