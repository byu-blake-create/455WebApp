import { sendJson, withHandler } from "./_lib/http.js";
import { searchCustomers } from "../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const url = new URL(req.url, "http://localhost");
      const query = url.searchParams.get("q") || "";
      const customers = await searchCustomers(query);
      sendJson(res, 200, { customers });
    }
  });
}
