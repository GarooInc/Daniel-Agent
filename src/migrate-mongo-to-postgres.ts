import "dotenv/config";
import { getDb, closeMongo } from "./integrations/mongo/client.js";
import { getPool, closePostgres } from "./integrations/postgres/client.js";
import { upsertFaqDocument } from "./integrations/postgres/documents.js";
import { saveTicketConversation } from "./integrations/postgres/ticket-conversations.js";
import type { Faq } from "./knowledge-base/types.js";

// Backfill de las 3 colecciones de Mongo que no son autolimpiantes/transitorias (ver
// plans/2026-08-18-migracion-postgresql-pgvector.md, paso 6 y la tabla de "Qué se migra"):
// customers (dato de negocio real), documents (FAQs, reusa el embedding ya calculado en vez de
// volver a llamar a OpenRouter) y ticket_conversations (puede haber tickets abiertos ahora
// mismo). Pensado para correrse una sola vez, justo antes del corte del paso 7 — no antes, para
// minimizar el delta perdido entre este backfill y el momento real del corte — pero es
// idempotente (mismo criterio que migrate-customers.ts) por si hace falta repetirlo.

type MongoFaqDoc = Faq & { text?: string; embedding: number[] };

async function migrateDocuments(): Promise<void> {
  const db = await getDb();
  const docs = await db.collection<MongoFaqDoc>("documents").find({}).toArray();
  console.log(`Migrando ${docs.length} FAQs de "documents" (reusando embeddings ya calculados)...`);
  for (const doc of docs) {
    const faq: Faq = {
      id: doc.id,
      producto: doc.producto,
      categoria: doc.categoria,
      pregunta: doc.pregunta,
      respuesta: doc.respuesta,
      tags: doc.tags,
    };
    await upsertFaqDocument(faq, doc.embedding);
    console.log(`  ${doc.id}`);
  }
}

type MongoCustomerDoc = {
  slackUserId?: string;
  nombreCliente?: string;
  email?: string;
  empresa?: string;
  producto?: string;
  plan?: string;
  estadoCuenta?: string;
  fechaAlta?: string;
  canalPreferido?: string;
  notas?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

// No se reusa saveCustomerProfile() de integrations/postgres/customer-profile.ts a propósito:
// esa función espera un slackUserId siempre presente y trata "" como ausente, pero acá hay
// documentos de Mongo sin slackUserId (clientes migrados de customers.json que nunca hablaron
// por Slack, ver migrate-customers.ts) y queremos preservar createdAt/updatedAt originales en
// vez de pisarlos con now().
async function migrateCustomers(): Promise<void> {
  const db = await getDb();
  const pool = await getPool();
  const docs = await db.collection<MongoCustomerDoc>("customers").find({}).toArray();
  console.log(`Migrando ${docs.length} clientes de "customers"...`);

  for (const doc of docs) {
    const email = doc.email?.toLowerCase();
    const createdAt = doc.createdAt ?? new Date();
    const updatedAt = doc.updatedAt ?? new Date();
    const common = [
      doc.slackUserId ?? null,
      doc.nombreCliente ?? null,
      doc.empresa ?? null,
      doc.producto ?? null,
      doc.plan ?? null,
      doc.estadoCuenta ?? null,
      doc.fechaAlta ?? null,
      doc.canalPreferido ?? null,
      doc.notas ?? null,
      doc.tenantId ?? null,
    ];

    if (email) {
      // Mismo criterio de "email es la clave canónica" que customer-profile.ts — el índice
      // único parcial (WHERE email IS NOT NULL) exige repetir ese WHERE en el ON CONFLICT.
      await pool.query(
        `INSERT INTO customers (
           email, slack_user_id, nombre_cliente, empresa, producto, plan,
           estado_cuenta, fecha_alta, canal_preferido, notas, tenant_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
           slack_user_id = EXCLUDED.slack_user_id,
           nombre_cliente = EXCLUDED.nombre_cliente,
           empresa = EXCLUDED.empresa,
           producto = EXCLUDED.producto,
           plan = EXCLUDED.plan,
           estado_cuenta = EXCLUDED.estado_cuenta,
           fecha_alta = EXCLUDED.fecha_alta,
           canal_preferido = EXCLUDED.canal_preferido,
           notas = EXCLUDED.notas,
           tenant_id = EXCLUDED.tenant_id,
           updated_at = EXCLUDED.updated_at`,
        [email, ...common, createdAt, updatedAt],
      );
      console.log(`  ${email}`);
      continue;
    }

    if (!doc.slackUserId) {
      console.log(`  (omitido: sin email ni slackUserId, doc no identificable)`);
      continue;
    }

    // Sin email: no hay unique constraint sobre slack_user_id (a propósito, ver schema.ts) —
    // UPDATE primero y, si no afectó ninguna fila, INSERT, para no duplicar en reruns.
    const updateResult = await pool.query(
      `UPDATE customers SET
         nombre_cliente = $2, empresa = $3, producto = $4, plan = $5, estado_cuenta = $6,
         fecha_alta = $7, canal_preferido = $8, notas = $9, tenant_id = $10, updated_at = $11
       WHERE slack_user_id = $1 AND email IS NULL`,
      [doc.slackUserId, ...common.slice(1), updatedAt],
    );
    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO customers (
           slack_user_id, nombre_cliente, empresa, producto, plan,
           estado_cuenta, fecha_alta, canal_preferido, notas, tenant_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [...common, createdAt, updatedAt],
      );
    }
    console.log(`  slackUserId:${doc.slackUserId} (sin email)`);
  }
}

type MongoTicketConversationDoc = {
  mondayItemId: string;
  slackUserId: string;
  channelId: string;
};

async function migrateTicketConversations(): Promise<void> {
  const db = await getDb();
  const docs = await db.collection<MongoTicketConversationDoc>("ticket_conversations").find({}).toArray();
  console.log(`Migrando ${docs.length} correlaciones de "ticket_conversations"...`);
  for (const doc of docs) {
    await saveTicketConversation(doc.mondayItemId, doc.slackUserId, doc.channelId);
    console.log(`  ${doc.mondayItemId}`);
  }
}

async function main() {
  await migrateDocuments();
  await migrateCustomers();
  await migrateTicketConversations();
  console.log("Listo. Los datos originales en Mongo no se tocaron ni se borraron.");
  await closeMongo();
  await closePostgres();
}

main().catch((error) => {
  console.error("Falló el backfill:", error);
  process.exitCode = 1;
});
