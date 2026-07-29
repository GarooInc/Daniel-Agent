import "dotenv/config";
import { askDaniel } from "./agent/index.js";

const pregunta = process.argv.slice(2).join(" ") || "¿Cómo conecto Isabella con mi calendario?";
const respuesta = await askDaniel(pregunta);

console.log(`Pregunta: ${pregunta}\n`);
console.log(`Daniel: ${respuesta}`);
