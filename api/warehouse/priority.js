import { sendJson, withHandler } from "../_lib/http.js";
import { getPriorityQueue } from "../../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const queue = await getPriorityQueue();
      sendJson(res, 200, queue);
    }
  });
}
