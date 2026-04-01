import { readJson, sendJson, withHandler } from "./_lib/http.js";
import { getCustomerById, setCustomerCookie } from "../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    POST: async () => {
      const body = await readJson(req);
      const customerId = Number.parseInt(String(body.customerId || ""), 10);

      if (Number.isNaN(customerId)) {
        sendJson(res, 400, { error: "Select a valid customer." });
        return;
      }

      const customer = await getCustomerById(customerId);

      if (!customer) {
        sendJson(res, 404, { error: "Customer not found." });
        return;
      }

      setCustomerCookie(res, customerId);
      sendJson(res, 200, { customer });
    }
  });
}
