import "dotenv/config";
import { REQUIRED_ENV_VARS, getMissingEnvVars } from "./config/env.js";

const missing = getMissingEnvVars();

console.log("RedTec Portal - Daniel - AGENTE DE SOPORTE");
console.log(`Variables de entorno cargadas: ${REQUIRED_ENV_VARS.length - missing.length}/${REQUIRED_ENV_VARS.length}`);

if (missing.length > 0) {
  console.log(`Faltan: ${missing.join(", ")}`);
} else {
  console.log("Todas las variables requeridas están presentes.");
}
