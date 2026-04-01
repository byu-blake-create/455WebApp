import { sendJson, withHandler } from "../_lib/http.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    POST: async () => {
      sendJson(res, 200, {
        ok: false,
        message:
          "Run Scoring is not executed inside the deployed app. Run your pipeline separately and write predictions into Supabase order_predictions.",
        ordersScored: null,
        ranAt: new Date().toISOString(),
        stdout: "",
        stderr: ""
      });
    }
  });
}
