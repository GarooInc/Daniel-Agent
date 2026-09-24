// Script de un solo uso: siembra `client_wiki` con las páginas compiladas en `kb/clientes/*.md`
// (ver kb/gaps-y-decisiones.md, sesión del 2026-09-22/24). Idempotente (saveClientWiki hace
// ON CONFLICT DO UPDATE) — correr de nuevo tras editar un archivo actualiza esa página sin tocar
// las demás. Cada archivo de origen tiene su propio banner de metadata (fuente, decisiones,
// avisos de visibilidad) pensado para quien edite el .md, no para el prompt de Daniel — este
// script lo descarta y solo siembra el cuerpo (desde el primer "##" en adelante). El filtrado de
// contenido **[INTERNO]** para lo que Daniel realmente ve pasa en runtime
// (integrations/postgres/client-wiki.ts#stripInternalContent al leer, no acá al escribir) — la
// fila en `client_wiki` guarda el documento completo, marcas incluidas.
//
// Deliberadamente afuera de este SEED (no son un cliente de soporte real, ver
// kb/clientes/tenants-crm-realstate.md y kb/inventario-clientes-menores.md): el tenant interno
// "RedTec.ai", Archgroup/Hoteles (ya no existen), Liga Tenis GT y el resto del inventario cruzado
// de clientes de web/chatbot menores.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { saveClientWiki } from "./integrations/postgres/client-wiki.js";
import { closePostgres } from "./integrations/postgres/client.js";
import { logger } from "./config/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_CLIENTES_DIR = path.join(__dirname, "..", "kb", "clientes");

const SEED: { empresa: string; file: string }[] = [
  { empresa: "El Injerto", file: "el-injerto.md" },
  { empresa: "El Convento", file: "el-convento.md" },
  { empresa: "Wyndham Guatemala", file: "wyndham-guatemala.md" },
  { empresa: "Hoteles Belize", file: "hoteles-belize.md" },
  { empresa: "Desarrollos CAP", file: "desarrollos-cap.md" },
  { empresa: "OKÜN Living", file: "okun-living.md" },
  { empresa: "Spectrum", file: "spectrum.md" },
  { empresa: "RNR", file: "rnr.md" },
  { empresa: "Mundo Verde", file: "mundo-verde.md" }, // incluye Bravante, ver decisión en el archivo
  { empresa: "Grupo Althura", file: "grupo-althura.md" },
  { empresa: "Constructora Rosero", file: "constructora-rosero.md" },
  { empresa: "Reynoso Bienes Raices", file: "reynoso-bienes-raices.md" },
  { empresa: "Cofiño", file: "cofino.md" },
  { empresa: "Grupo Paz", file: "grupo-paz.md" },
  { empresa: "Grupo SyG", file: "grupo-syg.md" },
  { empresa: "Axis", file: "axis.md" },
];

// El banner de cada archivo es un blockquote (líneas "> ...") entre el título H1 y el primer "##"
// — metadata de sourcing/decisiones para quien edite el .md, no contenido para el prompt.
function extractBody(markdown: string): string {
  const firstHeadingIdx = markdown.indexOf("\n## ");
  if (firstHeadingIdx === -1) return markdown.trim();
  return markdown.slice(firstHeadingIdx + 1).trim();
}

async function main(): Promise<void> {
  for (const seed of SEED) {
    const filePath = path.join(KB_CLIENTES_DIR, seed.file);
    const raw = readFileSync(filePath, "utf-8");
    const contenido = extractBody(raw);
    await saveClientWiki(seed.empresa, contenido, [`kb/clientes/${seed.file}`]);
    logger.info({ empresa: seed.empresa, file: seed.file }, "client_wiki sembrada");
  }
  logger.info({ count: SEED.length }, "client_wiki: siembra completa");
}

main()
  .catch((err) => {
    logger.error({ err }, "Falló la siembra de client_wiki");
    process.exitCode = 1;
  })
  .finally(() => closePostgres());
