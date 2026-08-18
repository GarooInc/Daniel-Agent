import { Pool, type ClientBase } from "pg";
import pgvector from "pgvector/pg";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { SCHEMA_SQL } from "./schema.js";

let pool: Pool | undefined;
let poolPromise: Promise<Pool> | undefined;

// Registra el parser de tipo `vector` en cada conexión nueva del pool (pgvector-node requiere
// esto por cliente, no es algo que se configure una sola vez a nivel Pool) — sin esto, un
// SELECT que devuelva una columna `vector` llega como el string crudo de Postgres en vez de
// number[]. Best-effort: en el primerísimo connect, antes de que ensureSchema() cree la
// extensión, esto falla ("vector type not found") — se loguea y se sigue, la siguiente
// conexión del pool (ya con la extensión creada) lo resuelve solo.
async function registerVectorType(client: ClientBase): Promise<void> {
  try {
    await pgvector.registerTypes(client);
  } catch (error) {
    logger.warn({ err: error }, "No se pudo registrar el tipo vector en esta conexión de Postgres (normal antes de que exista la extensión)");
  }
}

// Mismo patrón que integrations/mongo/client.ts: pool singleton perezoso, con la conexión
// (y acá también el bootstrap del schema) reintentable si falla — poolPromise se resetea a
// undefined en el catch para no quedar "pegado" con una promesa rota si hubo un problema de
// red/DNS temporal al arrancar el contenedor.
export function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        pool = new Pool({ connectionString: env.postgresUrl, onConnect: registerVectorType });
        // Idempotente (CREATE TABLE/INDEX IF NOT EXISTS): se puede correr en cada arranque sin
        // riesgo, igual que Mongo crea sus índices al conectar. Ver schema.ts para el porqué de
        // que esto viva como string TS en vez de un archivo .sql suelto.
        await pool.query(SCHEMA_SQL);
        return pool;
      } catch (error) {
        poolPromise = undefined;
        pool = undefined;
        throw error;
      }
    })();
  }
  return poolPromise;
}

// Para scripts de un solo uso (backfill, tests) — el bot en producción nunca la llama, vive
// corriendo. Mismo rol que closeMongo() en integrations/mongo/client.ts.
export async function closePostgres(): Promise<void> {
  await pool?.end();
  pool = undefined;
  poolPromise = undefined;
}
