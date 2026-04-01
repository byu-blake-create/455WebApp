import { sendJson, withHandler } from "../_lib/http.js";
import { getCurrentCustomer } from "../../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const customer = await getCurrentCustomer(req, res);
      sendJson(res, 200, { customer });
    }
  });
}
