export const REQUIRED_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "SLACK_APP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "MONDAY_API_TOKEN",
  "MONGODB_URI",
] as const;

export function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

export const env = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  slackAppToken: process.env.SLACK_APP_TOKEN,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
  slackEscalationChannel: process.env.SLACK_ESCALATION_CHANNEL || "escalacion",
  mondayApiToken: process.env.MONDAY_API_TOKEN,
  mongodbUri: process.env.MONGODB_URI,
  mongodbDbName: process.env.MONGODB_DB_NAME || "daniel",
};
