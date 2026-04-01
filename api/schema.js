import { sendJson, withHandler } from "./_lib/http.js";
import { getSchemaOverview } from "../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const schema = await getSchemaOverview();
      sendJson(res, 200, { schema });
    }
  });
}
