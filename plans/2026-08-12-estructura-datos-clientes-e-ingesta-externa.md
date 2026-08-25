# Decisión: identidad de cliente unificada + convención para datos de sistemas externos

Fecha: 2026-08-12. Decidido por Jorge, diseño y redacción con Claude Code.

## Por qué hizo falta esta decisión

Al planear el "Agente Técnico" (`plans/agente-tecnico/2026-08-12-diseno-inicial.md`) apareció una
dependencia sobre `profile?.empresa` para decidir si mostrarle esa tool a un cliente. Al revisar
el código, **ese campo no existe en ningún lado accesible por `slackUserId`**. Hoy conviven tres
nociones de "cliente" sin conectar:

1. `users` (Mongo, colección real, por `slackUserId`) — solo `nombreCliente`/`email`, capturado
   automático de la conversación (`customer-profile.ts`).
2. `customers.json` (archivo estático, por `email`) — datos de cuenta reales: `empresa`,
   `producto`, `plan`, `estadoCuenta`, `fechaAlta`, `canalPreferido`, `notas`. Es lo que devuelve
   la tool `buscar_cliente` (`lookup-customer.ts`).
3. `tenantId` de RedTec Realstate (futuro, sin mapeo todavía — ver `crm-events-cache.ts` y
   `ESTADO-PROYECTO.md` pendiente #8/#10).

Sin resolver esto una vez, cada iniciativa (Agente Técnico, mapeo de tenant de RedTec, la
migración ya pendiente de `customers.json`, ver `ESTADO-PROYECTO.md` pendiente #2) iba a inventar
su propia forma parcial de conseguir "a qué empresa pertenece este usuario de Slack".

## Decisión 1: fusionar `users` + `customers.json` en una sola colección `customers`

**Clave canónica: `email`** (normalizado a lowercase/trim antes de cualquier lookup o upsert).

Reemplaza tanto `users` (colección Mongo actual) como `customers.json` (archivo estático). Un
solo documento por cliente real, con todos los campos que hoy están repartidos:

```ts
type CustomerDoc = {
  email: string;              // clave canónica, índice único
  slackUserId?: string;       // índice — cómo se lo encuentra desde una conversación de Slack
  nombreCliente?: string;     // nombre de contacto (ya en `users` hoy)
  empresa?: string;           // ya en customers.json
  producto?: string;          // ya en customers.json
  plan?: string;              // ya en customers.json
  estadoCuenta?: string;      // ya en customers.json
  fechaAlta?: string;         // ya en customers.json
  canalPreferido?: string;    // ya en customers.json
  notas?: string;             // ya en customers.json
  tenantId?: string;          // futuro — RedTec Realstate, se llena cuando exista el mapeo
  createdAt: Date;
  updatedAt: Date;
};
```

**Cómo se resuelve un documento en runtime:**
- Antes de conocer el email (arranque de una conversación nueva), se busca/crea por
  `slackUserId` — mismo comportamiento que `users` hoy.
- En cuanto se conoce el email (lo da el cliente, o ya estaba guardado), el upsert pasa a ser
  por `email` — si ese email ya existe como cuenta real (migrada de `customers.json`), se
  enriquece ese mismo documento con `slackUserId`/`nombreCliente` en vez de crear uno nuevo.
  Esto es lo que hoy falta: un cliente real que escribe por Slack nunca se conecta con su fila
  de `customers.json`, aunque el email coincida exactamente.

**Migración (script nuevo, mismo patrón que `migrate:faqs`):**
1. `npm run migrate:customers` — lee `customers.json`, upsertea por `email` en la colección
   `customers` nueva.
2. Migrar los documentos ya existentes en `users` (producción): por cada uno, si el `email`
   coincide con un doc recién migrado de `customers.json`, hacer merge (agregar
   `slackUserId`/`nombreCliente` al documento de cuenta real); si no coincide (el caso común hoy,
   dado que la mayoría del tráfico es dogfooding interno, no clientes reales de
   `customers.json`), migrar tal cual como un documento propio sin `empresa`/`producto`/etc.
3. Idempotente, igual que `migrate:faqs` — se puede correr de nuevo sin duplicar.

**Impacto en código (no incluido en este documento — es la siguiente sesión de trabajo, ver
`ESTADO-PROYECTO.md` pendiente #2):**
- `customer-profile.ts` pasa a leer/escribir la colección `customers` (antes `users`).
- `lookup-customer.ts` deja de leer `customers.json` estático — consulta Mongo por email.
- El tipo `CustomerProfile` gana `empresa`/`producto`/`plan`/`estadoCuenta`/`tenantId` opcionales.
- El gating del Agente Técnico (`profile?.empresa`, ver su plan) pasa a funcionar con un dato
  real en vez de un campo que hoy no existe en ningún lado alcanzable por `slackUserId`.
- `knowledge-base/customers.ts` (`getCustomerByEmail`, sobre el JSON) se retira una vez migrado.

## Decisión 2: convención estándar para datos que llegan de sistemas externos

Aplica a cualquier integración que reciba datos empujados desde afuera (el webhook interno
genérico, el realtime de RedTec, y cualquier integración futura del mismo tipo) — formaliza el
patrón que ya emergió de facto con `platform_metrics`/`platform_events`, en vez de que cada
integración nueva decida desde cero:

1. **Colección `<fuente>_raw` para todo lo que entra sin procesar**, con **TTL por defecto de 30
   días** (índice `expireAfterSeconds`) salvo que la fuente tenga una necesidad real de otra
   ventana (ej. `platform_metrics` ya usa 7 días a propósito, por volumen — ver
   `platform-metrics.ts`). Nunca se lee esta colección en el camino caliente de una respuesta a
   cliente — es para auditar/reprocesar si hace falta.
2. **Colección tipada derivada, recién cuando el schema real se conoce y hay un consumidor
   real** (mismo patrón que `platform_metrics`/`platform_events` sobre el socket de RedTec). No
   se crea una colección tipada especulativa antes de tener ambas cosas.
3. **Toda colección de ingesta externa con noción de cliente/cuenta usa el mismo vocabulario que
   `customers`** — campo `tenantId` o `empresa`, nunca un nombre distinto — para poder unirse por
   esa clave más adelante sin inventar una nueva cada vez. `platform_events` ya sigue esto
   (`tenantId`); queda como estándar a propósito, no una coincidencia.

**Acción concreta que se deriva de esto, pendiente de aplicar**: `webhook_raw_events` hoy no
tiene TTL (crece sin límite desde 2026-08-11) — agregarle el TTL de 30 días de esta convención es
un cambio de código chico y autocontenido, separado de la migración de `customers` de arriba.

## Qué NO se decide acá (a propósito)

- No se introduce un `customerId` interno separado del email ni un modelo de identidad
  multi-canal (ej. WhatsApp/widget) — no existe today un segundo canal real, y el email ya
  alcanza como clave única entre Slack y `customers.json`. Se revisita cuando el canal #2
  (`ESTADO-PROYECTO.md` pendiente de roadmap #7) sea código real, no antes.
- No se decide el schema tipado del webhook genérico (`ESTADO-PROYECTO.md` pendiente #13) — sigue
  bloqueado en conocer el payload real de quien lo use. Esta decisión solo fija que, cuando ese
  día llegue, siga el patrón de la Decisión 2.

## Próximo paso al retomar

1. Aplicar el TTL de 30 días a `webhook_raw_events` (chico, aislado, sin dependencias).
2. Migración de `customers` (script + reemplazo de `customer-profile.ts`/`lookup-customer.ts`) —
   esto es lo que ya estaba anotado como pendiente #2 en `ESTADO-PROYECTO.md`, ahora con el diseño
   concreto de arriba en vez de "migrar a una colección plana" sin más detalle.
