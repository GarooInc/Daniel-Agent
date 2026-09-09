// Script de un solo uso: siembra `monday_clientes` con los mapeos confirmados en vivo (ver
// schema.ts para el porqué de la tabla). Idempotente (upsertMondayCliente hace ON CONFLICT DO
// UPDATE). A diferencia de migrate-whatsapp-groups.ts, esta lista arranca corta a propósito —
// solo se confirmó un valor real hasta ahora (ticket de Rock N Rolla, 2026-09-09). Agregar un
// cliente nuevo cuando aparezca es correr upsertMondayCliente puntual, no hace falta re-correr
// este script entero.
import { upsertMondayCliente } from "./integrations/postgres/monday-clientes.js";
import { closePostgres } from "./integrations/postgres/client.js";
import { logger } from "./config/logger.js";

const SEED: { mondayCliente: string; empresa: string }[] = [{ mondayCliente: "Rock N Rolla", empresa: "RNR" }];

async function main(): Promise<void> {
  for (const seed of SEED) {
    await upsertMondayCliente(seed.mondayCliente, seed.empresa);
  }
  logger.info({ count: SEED.length }, "monday_clientes sembrada");
}

main()
  .catch((err) => {
    logger.error({ err }, "Falló la siembra de monday_clientes");
    process.exitCode = 1;
  })
  .finally(() => closePostgres());
