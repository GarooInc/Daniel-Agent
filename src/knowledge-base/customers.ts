import customersData from "../data/customers.json" with { type: "json" };
import type { Customer } from "./types.js";

const customers = customersData as Customer[];

// Hoy solo la usa test-e2e.ts para poblar su store en memoria. El lookup por email en vivo
// (buscar_cliente) ya no lee este JSON — consulta la tabla `customers` de Postgres directamente
// (ver integrations/postgres/customer-profile.ts y
// plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md).
export function getAllCustomers(): Customer[] {
  return customers;
}
