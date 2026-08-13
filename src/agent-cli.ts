import "dotenv/config";
import { askDaniel } from "./agent/index.js";

const pregunta = process.argv.slice(2).join(" ") || "¿Cómo conecto Isabella con mi calendario?";

console.log("RedTec Portal - Daniel - AGENTE DE SOPORTE");
console.log(`Pregunta: ${pregunta}\n`);
const respuesta = await askDaniel(pregunta, "cli-local-test", "cli-local-test");


console.log(`Daniel: ${respuesta}`);
