import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCustomerByEmail } from "../../integrations/mongo/customer-profile.js";

export const lookupCustomerTool = tool(
  async ({ email }) => {
    const customer = await getCustomerByEmail(email);
    if (!customer) return "No se encontró ningún cliente con ese email.";
    return JSON.stringify(customer, null, 2);
  },
  {
    name: "buscar_cliente",
    description: "Busca el estado de una cuenta de cliente por su email.",
    schema: z.object({
      email: z.string().describe("Email del cliente"),
    }),
  },
);
