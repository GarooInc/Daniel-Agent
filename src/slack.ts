import "dotenv/config";
import { startSlackBot } from "./channels/slack/index.js";

await startSlackBot();
