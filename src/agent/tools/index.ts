import { searchFaqsTool } from "./search-faqs.js";
import { lookupCustomerTool } from "./lookup-customer.js";
import { escalateToMondayTool } from "./escalate-to-monday.js";

export const tools = [searchFaqsTool, lookupCustomerTool, escalateToMondayTool];

export const toolsByName: Record<string, any> = Object.fromEntries(tools.map((t) => [t.name, t]));
