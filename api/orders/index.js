import { readJson, sendJson, withHandler } from "../_lib/http.js";
import { createOrder, getCustomerOrThrow, getOrdersForCustomer } from "../../server/shop.js";

export default async function handler(req, res) {
  return withHandler(req, res, {
    GET: async () => {
      const result = await getCustomerOrThrow(req, res);

      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return;
      }

      const orders = await getOrdersForCustomer(result.customer.customer_id);
      sendJson(res, 200, {
        customer: result.customer,
        orders
      });
    },
    POST: async () => {
      const result = await getCustomerOrThrow(req, res);

      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return;
      }

      try {
        const body = await readJson(req);
        const rawLineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
        const lineItems = rawLineItems
          .map((lineItem) => ({
            productId: Number.parseInt(String(lineItem.productId || ""), 10),
            quantity: Number.parseInt(String(lineItem.quantity || ""), 10)
          }))
          .filter(
            (lineItem) =>
              !Number.isNaN(lineItem.productId) &&
              !Number.isNaN(lineItem.quantity) &&
              lineItem.quantity > 0
          );
        const created = await createOrder(result.customer.customer_id, lineItems);
        sendJson(res, 201, created);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
    }
  });
}
