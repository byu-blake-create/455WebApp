import { sendJson, withHandler } from "./_lib/http.js";
import { getActiveProducts } from "../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const products = await getActiveProducts();
      sendJson(res, 200, { products });
    }
  });
}
