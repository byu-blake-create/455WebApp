import { sendJson, withHandler } from "./_lib/http.js";
import { clearCustomerCookie } from "../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    POST: async () => {
      clearCustomerCookie(res);
      sendJson(res, 200, { ok: true });
    }
  });
}
