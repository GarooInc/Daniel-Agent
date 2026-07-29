export const REQUIRED_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "SLACK_APP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "MONDAY_API_TOKEN",
] as const;

export function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

export const env = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-5-mini",
  slackAppToken: process.env.SLACK_APP_TOKEN,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
  mondayApiToken: process.env.MONDAY_API_TOKEN,
};
