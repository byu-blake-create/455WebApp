import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import cookieParser from "cookie-parser";
import express from "express";
import {
  clearCustomerCookie,
  createOrder,
  getActiveProducts,
  getCurrentCustomer,
  getCustomerById,
  getCustomerIdFromRequest,
  getCustomerSummary,
  getOrderDetail,
  getOrdersForCustomer,
  getPriorityQueue,
  getSchemaOverview,
  searchCustomers,
  setCustomerCookie
} from "./shop.js";

const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scoringScriptPath = path.join(projectRoot, "jobs", "run_inference.py");

app.use(express.json());
app.use(cookieParser());

function parseOrdersScored(stdout) {
  const patterns = [
    /(\d+)\s+orders?\s+scored/i,
    /scored[:\s]+(\d+)/i,
    /(\d+)\s+predictions?/i,
    /rows?\s+written[:\s]+(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = stdout.match(pattern);

    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

function requireCustomer(req, res) {
  const customerId = getCustomerIdFromRequest(req);

  if (!customerId) {
    res.status(401).json({ error: "No customer selected." });
    return null;
  }

  const customer = getCustomerById(customerId);

  if (!customer) {
    clearCustomerCookie(res);
    res.status(401).json({ error: "Selected customer no longer exists." });
    return null;
  }

  return customer;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/customer/current", (req, res) => {
  res.json({ customer: getCurrentCustomer(req, res) });
});

app.get("/api/customers", (req, res) => {
  res.json({ customers: searchCustomers(String(req.query.q || "")) });
});

app.post("/api/select-customer", (req, res) => {
  const customerId = Number.parseInt(String(req.body.customerId || ""), 10);

  if (Number.isNaN(customerId)) {
    return res.status(400).json({ error: "Select a valid customer." });
  }

  const customer = getCustomerById(customerId);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found." });
  }

  setCustomerCookie(res, customerId);
  return res.json({ customer });
});

app.post("/api/clear-customer", (_req, res) => {
  clearCustomerCookie(res);
  res.json({ ok: true });
});

app.get("/api/dashboard", (req, res) => {
  const customer = requireCustomer(req, res);

  if (!customer) {
    return;
  }

  res.json(getCustomerSummary(customer.customer_id));
});

app.get("/api/products", (_req, res) => {
  res.json({ products: getActiveProducts() });
});

app.post("/api/orders", (req, res) => {
  try {
    const customer = requireCustomer(req, res);

    if (!customer) {
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

    const result = createOrder(customer.customer_id, lineItems);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/orders", (req, res) => {
  const customer = requireCustomer(req, res);

  if (!customer) {
    return;
  }

  res.json({
    customer,
    orders: getOrdersForCustomer(customer.customer_id)
  });
});

app.get("/api/orders/:orderId", (req, res) => {
  const customer = requireCustomer(req, res);

  if (!customer) {
    return;
  }

  const orderId = Number.parseInt(req.params.orderId, 10);
  const detail = getOrderDetail(orderId, customer.customer_id);

  if (!detail) {
    return res.status(404).json({ error: "Order not found." });
  }

  return res.json(detail);
});

app.get("/api/schema", (_req, res) => {
  res.json({ schema: getSchemaOverview() });
});

app.get("/api/warehouse/priority", (_req, res) => {
  res.json(getPriorityQueue());
});

app.post("/api/scoring/run", async (_req, res) => {
  const ranAt = new Date().toISOString();

  if (!fs.existsSync(scoringScriptPath)) {
    return res.status(400).json({
      ok: false,
      message:
        "Missing jobs/run_inference.py. Add your pipeline inference script at that path and try again.",
      ordersScored: null,
      ranAt,
      stdout: "",
      stderr: ""
    });
  }

  async function runWith(command) {
    return execFileAsync(command, ["jobs/run_inference.py"], {
      cwd: projectRoot,
      timeout: 120_000,
      maxBuffer: 1024 * 1024
    });
  }

  try {
    let result;

    try {
      result = await runWith("python3");
    } catch (error) {
      if (error.code === "ENOENT") {
        result = await runWith("python");
      } else {
        throw error;
      }
    }

    res.json({
      ok: true,
      message: "Scoring completed successfully.",
      ordersScored: parseOrdersScored(result.stdout || ""),
      ranAt,
      stdout: result.stdout?.trim() || "",
      stderr: result.stderr?.trim() || ""
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: `Scoring failed: ${error.message}`,
      ordersScored: parseOrdersScored(error.stdout || ""),
      ranAt,
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || ""
    });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(projectRoot, "dist");

  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    return res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  res.status(500).json({
    error: error.message || "Unexpected server error."
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
