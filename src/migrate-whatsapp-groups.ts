// Script de un solo uso: siembra `whatsapp_groups` con la clasificación real de los grupos que
// ve hoy el número compartido `RedtecBot` (lista pasada por Fernando 2026-09-06, clasificada por
// Jorge la misma fecha — ver plans/2026-09-06-canal-whatsapp-evolution-api.md, "Datos de
// referencia"). Idempotente (upsertWhatsappGroup hace ON CONFLICT DO UPDATE). Los grupos internos
// de RedTec (Expansión Redtec, Front End - Garoo, RedTec Dev, RedtecAi) quedan afuera a propósito
// — no se insertan, así que un mensaje ahí nunca resuelve `empresa` y Daniel lo ignora.
import { upsertWhatsappGroup } from "./integrations/postgres/whatsapp-groups.js";
import { closePostgres } from "./integrations/postgres/client.js";
import { logger } from "./config/logger.js";

const SEED: { groupJid: string; empresa: string; nombreGrupo: string }[] = [
  { groupJid: "120363408879151065@g.us", empresa: "Cofiño", nombreGrupo: "Cofiño" },
  { groupJid: "120363410662746111@g.us", empresa: "Reynoso Bienes Raices", nombreGrupo: "RedTec <> Reynoso Bienes Raices" },
  { groupJid: "120363428875380678@g.us", empresa: "Grupo Althura", nombreGrupo: "RedTec AI <> Grupo Althura" },
  { groupJid: "120363426250050151@g.us", empresa: "Constructora Rosero", nombreGrupo: "RedTec AI <> Constructora Rosero" },
  { groupJid: "120363430598286467@g.us", empresa: "Mundo Verde", nombreGrupo: "Mundo Verde" },
  { groupJid: "120363403874344508@g.us", empresa: "Bravante", nombreGrupo: "RedTec <> Bravante" },
  { groupJid: "120363409107032925@g.us", empresa: "RNR", nombreGrupo: "RedTec x RNR" },
  { groupJid: "120363428188434247@g.us", empresa: "RNR", nombreGrupo: "TRAFICO RFSCRS :::: RNR.23" },
];

async function main(): Promise<void> {
  for (const seed of SEED) {
    await upsertWhatsappGroup(seed.groupJid, seed.empresa, seed.nombreGrupo);
  }
  logger.info({ count: SEED.length }, "whatsapp_groups sembrada");
}

main()
  .catch((err) => {
    logger.error({ err }, "Falló la siembra de whatsapp_groups");
    process.exitCode = 1;
  })
  .finally(() => closePostgres());
