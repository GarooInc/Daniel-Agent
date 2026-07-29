import customersData from "../data/customers.json" with { type: "json" };
import type { Customer } from "./types.js";

const customers = customersData as Customer[];

export function getCustomerByEmail(email: string): Customer | undefined {
  const e = email.toLowerCase();
  return customers.find((customer) => customer.email.toLowerCase() === e);
}

export function getAllCustomers(): Customer[] {
  return customers;
}
