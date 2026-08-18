import { getPool } from "./client.js";

// Mismo shape que integrations/mongo/customer-profile.ts — se duplica acá en vez de importarla
// de mongo/ a propósito: la capa Postgres no debe depender de que integrations/mongo/ siga
// existiendo en el repo (ver plan de migración, paso 7: mongo/ queda como red de rollback, no
// como dependencia activa).
export type CustomerProfile = {
  nombreCliente?: string;
  email?: string;
  empresa?: string;
  producto?: string;
  plan?: string;
  estadoCuenta?: string;
  fechaAlta?: string;
  canalPreferido?: string;
  notas?: string;
  tenantId?: string; // RedTec Realstate — se llena cuando exista el mapeo (ver ESTADO-PROYECTO.md)
};

// Mapeo campo (camelCase, lado TS) <-> columna (snake_case, lado SQL). Único lugar donde vive
// esta correspondencia — todo lo demás en este archivo itera sobre este objeto en vez de
// hardcodear los nombres de columna en más de un lugar.
const COLUMNS: Record<keyof CustomerProfile, string> = {
  nombreCliente: "nombre_cliente",
  email: "email",
  empresa: "empresa",
  producto: "producto",
  plan: "plan",
  estadoCuenta: "estado_cuenta",
  fechaAlta: "fecha_alta",
  canalPreferido: "canal_preferido",
  notas: "notas",
  tenantId: "tenant_id",
};

const SELECT_COLUMNS = Object.values(COLUMNS).join(", ");

function rowToProfile(row: Record<string, string | null>): CustomerProfile {
  const profile: CustomerProfile = {};
  for (const [field, column] of Object.entries(COLUMNS) as [keyof CustomerProfile, string][]) {
    const value = row[column];
    if (value !== null && value !== undefined) profile[field] = value;
  }
  return profile;
}

// Identidad + cuenta del cliente por su Slack user_id. A diferencia de Mongo, `slack_user_id`
// no tiene una restricción unique (mismo criterio: el email es la clave canónica) — se ordena
// por `updated_at` para quedarse con la fila más reciente si por algún motivo hubiera más de una.
export async function getCustomerProfile(slackUserId: string): Promise<CustomerProfile | null> {
  const pool = await getPool();
  const result = await pool.query<Record<string, string | null>>(
    `SELECT ${SELECT_COLUMNS} FROM customers WHERE slack_user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [slackUserId],
  );
  const row = result.rows[0];
  return row ? rowToProfile(row) : null;
}

// Usada por buscar_cliente (lookup-customer.ts) — búsqueda directa por email.
export async function getCustomerByEmail(email: string): Promise<CustomerProfile | null> {
  const pool = await getPool();
  const result = await pool.query<Record<string, string | null>>(`SELECT ${SELECT_COLUMNS} FROM customers WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  const row = result.rows[0];
  return row ? rowToProfile(row) : null;
}

export async function saveCustomerProfile(slackUserId: string, profile: CustomerProfile): Promise<void> {
  const update: Partial<Record<keyof CustomerProfile, unknown>> = {};
  for (const key of Object.keys(COLUMNS) as (keyof CustomerProfile)[]) {
    const value = profile[key];
    if (value !== undefined && value !== "") update[key] = value;
  }
  if (Object.keys(update).length === 0) return;

  const pool = await getPool();
  const email = typeof update.email === "string" ? update.email.toLowerCase() : undefined;

  if (email) {
    // Email es la clave canónica: si ya existe una cuenta real con este email, se enriquece ese
    // mismo registro en vez de crear uno nuevo. Si este slackUserId tenía una fila propia de
    // antes de conocer su email (o con un email distinto), se borra para no dejar dos filas
    // encontrables por el mismo slackUserId una vez que el email ya lo identifica — mismo
    // comportamiento que el `deleteOne` + `upsert` de Mongo.
    await pool.query(`DELETE FROM customers WHERE slack_user_id = $1 AND email IS DISTINCT FROM $2`, [slackUserId, email]);

    const dynamicFields = (Object.keys(update) as (keyof CustomerProfile)[]).filter((f) => f !== "email");
    const dbColumns = dynamicFields.map((f) => COLUMNS[f]);
    const values = dynamicFields.map((f) => update[f]);
    const insertColumns = ["email", "slack_user_id", ...dbColumns];
    const placeholders = insertColumns.map((_, i) => `$${i + 1}`);
    const updateSet = ["slack_user_id = EXCLUDED.slack_user_id", ...dbColumns.map((c) => `${c} = EXCLUDED.${c}`), "updated_at = now()"].join(
      ", ",
    );

    // El índice único de `email` es parcial (WHERE email IS NOT NULL, ver schema.ts — no todo
    // cliente lo tiene todavía), y Postgres no infiere el conflicto contra un índice parcial a
    // menos que el ON CONFLICT repita exactamente ese WHERE (confirmado en vivo: sin esto tira
    // "there is no unique or exclusion constraint matching the ON CONFLICT specification").
    await pool.query(
      `INSERT INTO customers (${insertColumns.join(", ")}, updated_at)
       VALUES (${placeholders.join(", ")}, now())
       ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET ${updateSet}`,
      [email, slackUserId, ...values],
    );
    return;
  }

  // Sin email todavía: upsert por slack_user_id. No hay unique constraint sobre esa columna
  // (a propósito, igual que Mongo), así que ON CONFLICT no aplica acá — UPDATE primero y, si no
  // afectó ninguna fila, INSERT.
  const dynamicFields = Object.keys(update) as (keyof CustomerProfile)[];
  const dbColumns = dynamicFields.map((f) => COLUMNS[f]);
  const values = dynamicFields.map((f) => update[f]);
  const setClause = dbColumns.map((c, i) => `${c} = $${i + 2}`).join(", ");

  const updateResult = await pool.query(`UPDATE customers SET ${setClause}, updated_at = now() WHERE slack_user_id = $1`, [
    slackUserId,
    ...values,
  ]);
  if (updateResult.rowCount === 0) {
    const insertColumns = ["slack_user_id", ...dbColumns];
    const placeholders = insertColumns.map((_, i) => `$${i + 1}`);
    await pool.query(`INSERT INTO customers (${insertColumns.join(", ")}, updated_at) VALUES (${placeholders.join(", ")}, now())`, [
      slackUserId,
      ...values,
    ]);
  }
}
