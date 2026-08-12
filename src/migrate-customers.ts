import "dotenv/config";
import { getAllCustomers } from "./knowledge-base/index.js";
import { getDb, closeMongo } from "./integrations/mongo/client.js";

// Migra data/customers.json + la colección `users` existente a una sola colección `customers`,
// clave email (ver plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md — decisión
// tomada porque hoy "empresa" de un cliente no era accesible desde ningún lado por slackUserId).
// Idempotente en ambos pasos: se puede correr de nuevo sin duplicar ni pisar datos más nuevos
// con los fijos del JSON. No borra la colección `users` vieja — queda como respaldo hasta
// confirmar en vivo que `customers` la reemplaza sin problema.
async function main() {
  const db = await getDb();
  const customers = db.collection("customers");

  const seedData = getAllCustomers();
  console.log(`Migrando ${seedData.length} clientes de customers.json a la colección "customers"...`);
  for (const customer of seedData) {
    const email = customer.email.toLowerCase();
    await customers.updateOne(
      { email },
      {
        $set: {
          email,
          nombreCliente: customer.nombre,
          empresa: customer.empresa,
          producto: customer.producto,
          plan: customer.plan,
          estadoCuenta: customer.estadoCuenta,
          fechaAlta: customer.fechaAlta,
          canalPreferido: customer.canalPreferido,
          notas: customer.notas,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    console.log(`  ${customer.id} -> ${email}`);
  }

  console.log('Migrando los documentos existentes de la colección "users"...');
  const existingUsers = await db.collection("users").find({}).toArray();
  for (const user of existingUsers) {
    const slackUserId = typeof user.slackUserId === "string" ? user.slackUserId : undefined;
    const email = typeof user.email === "string" ? user.email.toLowerCase() : undefined;
    if (!slackUserId && !email) continue;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof user.nombreCliente === "string" && user.nombreCliente) update.nombreCliente = user.nombreCliente;

    if (email) {
      // Une con la cuenta real ya migrada arriba si el email coincide; si no, crea el
      // documento igual (cliente que habló por Slack pero no está en customers.json).
      await customers.updateOne(
        { email },
        { $set: { ...update, email, slackUserId }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    } else if (slackUserId) {
      await customers.updateOne(
        { slackUserId },
        { $set: update, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    }
    console.log(`  users:${slackUserId ?? "(sin slackUserId)"} -> customers`);
  }

  console.log(`Listo. ${existingUsers.length} documentos de "users" migrados. La colección "users" no se borró — queda de respaldo.`);
  await closeMongo();
}

main().catch((error) => {
  console.error("Falló la migración:", error);
  process.exitCode = 1;
});
