import customersData from "../data/customers.json" with { type: "json" };
import type { Customer } from "./types.js";

const customers = customersData as Customer[];

// Único caller: migrate-customers.ts. El lookup por email en vivo (buscar_cliente) ya no lee
// este JSON — consulta la colección `customers` de Mongo directamente (ver
// integrations/mongo/customer-profile.ts y plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md).
export function getAllCustomers(): Customer[] {
  return customers;
}
