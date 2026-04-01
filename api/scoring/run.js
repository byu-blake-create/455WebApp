import { runOrderScoring } from "../../server/scoring.js";
import { sendJson, withHandler } from "../_lib/http.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    POST: async () => {
      const payload = await runOrderScoring();
      sendJson(res, 200, payload);
    }
  });
}
