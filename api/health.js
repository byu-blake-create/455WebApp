import { sendJson, withHandler } from "./_lib/http.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      sendJson(res, 200, { ok: true });
    }
  });
}
