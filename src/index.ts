import "dotenv/config";

const requiredEnvVars = [
  "OPENROUTER_API_KEY",
  "SLACK_APP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "MONDAY_API_TOKEN",
];

const missing = requiredEnvVars.filter((name) => !process.env[name]);

console.log("Daniel — agente de soporte de RedTec");
console.log(`Variables de entorno cargadas: ${requiredEnvVars.length - missing.length}/${requiredEnvVars.length}`);

if (missing.length > 0) {
  console.log(`Faltan: ${missing.join(", ")}`);
} else {
  console.log("Todas las variables requeridas están presentes.");
}
