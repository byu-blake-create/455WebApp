import { sendJson, withHandler } from "../_lib/http.js";
import { getCustomerOrThrow, getOrderDetail, getOrderIdFromParams } from "../../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const result = await getCustomerOrThrow(req, res);

      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return;
      }

      const orderId = getOrderIdFromParams(req);

      if (!orderId) {
        sendJson(res, 400, { error: "Invalid order id." });
        return;
      }

      const detail = await getOrderDetail(orderId, result.customer.customer_id);

      if (!detail) {
        sendJson(res, 404, { error: "Order not found." });
        return;
      }

      sendJson(res, 200, detail);
    }
  });
}
