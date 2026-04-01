import { sendJson, withHandler } from "./_lib/http.js";
import { getCustomerOrThrow, getCustomerSummary } from "../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const result = await getCustomerOrThrow(req, res);

      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return;
      }

      const summary = await getCustomerSummary(result.customer.customer_id);
      sendJson(res, 200, summary);
    }
  });
}
