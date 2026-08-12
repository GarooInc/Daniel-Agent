import { getDb } from "./client.js";

// Ver plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md — antes esta colección
// (`users`) solo tenía nombreCliente/email, capturado de la conversación de Slack. Los datos
// reales de cuenta (empresa/producto/plan/etc., antes solo en data/customers.json, ver
// migrate-customers.ts) ahora viven en el mismo documento, unido por email.
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

type CustomerDoc = CustomerProfile & { slackUserId?: string; createdAt: Date; updatedAt: Date };

const COLLECTION = "customers";

const PROFILE_FIELDS = [
  "nombreCliente",
  "email",
  "empresa",
  "producto",
  "plan",
  "estadoCuenta",
  "fechaAlta",
  "canalPreferido",
  "notas",
  "tenantId",
] as const;

function projectProfile(doc: CustomerDoc): CustomerProfile {
  const profile: CustomerProfile = {};
  for (const field of PROFILE_FIELDS) {
    if (doc[field] !== undefined) profile[field] = doc[field];
  }
  return profile;
}

// Identidad + cuenta del cliente, buscada por su Slack user_id, para no volver a pedir datos
// ya conocidos (nombre/email) ni perder de vista su cuenta real (empresa/producto/plan) una
// vez que su email quedó vinculado (ver saveCustomerProfile).
export async function getCustomerProfile(slackUserId: string): Promise<CustomerProfile | null> {
  const db = await getDb();
  const doc = await db.collection<CustomerDoc>(COLLECTION).findOne({ slackUserId });
  return doc ? projectProfile(doc) : null;
}

// Usada por buscar_cliente (lookup-customer.ts) — búsqueda directa por email, sin depender de
// que ese cliente ya haya hablado por Slack.
export async function getCustomerByEmail(email: string): Promise<CustomerProfile | null> {
  const db = await getDb();
  const doc = await db.collection<CustomerDoc>(COLLECTION).findOne({ email: email.toLowerCase() });
  return doc ? projectProfile(doc) : null;
}

export async function saveCustomerProfile(slackUserId: string, profile: CustomerProfile): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    if (value !== undefined && value !== "") update[field] = value;
  }
  if (Object.keys(update).length === 0) return;

  const db = await getDb();
  const collection = db.collection<CustomerDoc>(COLLECTION);

  const email = typeof update.email === "string" ? update.email.toLowerCase() : undefined;
  if (email) {
    update.email = email;
    // Email es la clave canónica: si ya existe una cuenta real con este email (migrada de
    // customers.json, o vinculada antes por otra vía), se enriquece ese mismo documento en vez
    // de crear uno nuevo. Si este slackUserId tenía un documento propio de antes de conocer su
    // email (caso común: cliente nuevo que arranca sin dar el email), se borra para no dejar
    // dos documentos encontrables por el mismo slackUserId una vez que el email ya lo identifica.
    await collection.deleteOne({ slackUserId, email: { $ne: email } });
    await collection.updateOne(
      { email },
      { $set: { ...update, slackUserId, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return;
  }

  await collection.updateOne(
    { slackUserId },
    { $set: { ...update, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}
