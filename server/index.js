import cookieParser from "cookie-parser";
import express from "express";
import {
  clearCustomerCookie,
  createOrder,
  getActiveProducts,
  getCurrentCustomer,
  getCustomerById,
  getCustomerOrThrow,
  getCustomerSummary,
  getOrderDetail,
  getOrderIdFromParams,
  getOrdersForCustomer,
  getPriorityQueue,
  getSchemaOverview,
  searchCustomers,
  setCustomerCookie
} from "./shop.js";
import { runOrderScoring } from "./scoring.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/customer/current", async (req, res, next) => {
  try {
    res.json({ customer: await getCurrentCustomer(req, res) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/customers", async (req, res, next) => {
  try {
    res.json({ customers: await searchCustomers(String(req.query.q || "")) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/select-customer", async (req, res, next) => {
  try {
    const customerId = Number.parseInt(String(req.body.customerId || ""), 10);

    if (Number.isNaN(customerId)) {
      res.status(400).json({ error: "Select a valid customer." });
      return;
    }

    const customer = await getCustomerById(customerId);

    if (!customer) {
      res.status(404).json({ error: "Customer not found." });
      return;
    }

    setCustomerCookie(res, customerId);
    res.json({ customer });
  } catch (error) {
    next(error);
  }
});

app.post("/api/clear-customer", (_req, res) => {
  clearCustomerCookie(res);
  res.json({ ok: true });
});

app.get("/api/dashboard", async (req, res, next) => {
  try {
    const result = await getCustomerOrThrow(req, res);

    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json(await getCustomerSummary(result.customer.customer_id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (_req, res, next) => {
  try {
    res.json({ products: await getActiveProducts() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const result = await getCustomerOrThrow(req, res);

    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }

    const rawLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
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
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/orders", async (req, res, next) => {
  try {
    const result = await getCustomerOrThrow(req, res);

    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      customer: result.customer,
      orders: await getOrdersForCustomer(result.customer.customer_id)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders/:orderId", async (req, res, next) => {
  try {
    const result = await getCustomerOrThrow(req, res);

    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }

    const orderId = getOrderIdFromParams(req);
    const detail = await getOrderDetail(orderId, result.customer.customer_id);

    if (!detail) {
      res.status(404).json({ error: "Order not found." });
      return;
    }

    res.json(detail);
  } catch (error) {
    next(error);
  }
});

app.get("/api/schema", async (_req, res, next) => {
  try {
    res.json({ schema: await getSchemaOverview() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/warehouse/priority", async (_req, res, next) => {
  try {
    res.json(await getPriorityQueue());
  } catch (error) {
    next(error);
  }
});

app.post("/api/scoring/run", async (_req, res, next) => {
  try {
    res.json(await runOrderScoring());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  res.status(500).json({
    error: error.message || "Unexpected server error."
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
