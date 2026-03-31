import { all, get, getSchemaDetails, getTableColumns, run, tableExists, transaction } from "./db.js";

export const CUSTOMER_COOKIE = "selectedCustomerId";

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getCustomerIdFromRequest(req) {
  const rawValue = req.cookies?.[CUSTOMER_COOKIE];

  if (!rawValue) {
    return null;
  }

  const customerId = Number.parseInt(rawValue, 10);
  return Number.isNaN(customerId) ? null : customerId;
}

export function setCustomerCookie(res, customerId) {
  res.cookie(CUSTOMER_COOKIE, String(customerId), {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

export function clearCustomerCookie(res) {
  res.clearCookie(CUSTOMER_COOKIE);
}

export function searchCustomers(searchTerm = "") {
  const value = searchTerm.trim();

  if (!value) {
    return all(
      `SELECT customer_id, full_name, email
       FROM customers
       ORDER BY full_name
       LIMIT 50`
    );
  }

  const queryValue = `%${value}%`;

  return all(
    `SELECT customer_id, full_name, email
     FROM customers
     WHERE full_name LIKE ? OR email LIKE ?
     ORDER BY full_name
     LIMIT 50`,
    [queryValue, queryValue]
  );
}

export function getCustomerById(customerId) {
  return get(
    `SELECT customer_id, full_name, email, city, state, zip_code
     FROM customers
     WHERE customer_id = ?`,
    [customerId]
  );
}

export function getCurrentCustomer(req, res) {
  const customerId = getCustomerIdFromRequest(req);

  if (!customerId) {
    return null;
  }

  const customer = getCustomerById(customerId);

  if (!customer) {
    clearCustomerCookie(res);
    return null;
  }

  return customer;
}

export function getCustomerSummary(customerId) {
  const customer = getCustomerById(customerId);

  if (!customer) {
    return null;
  }

  const stats = get(
    `SELECT
       COUNT(*) AS totalOrders,
       COALESCE(SUM(order_total), 0) AS totalSpend
     FROM orders
     WHERE customer_id = ?`,
    [customerId]
  );

  const recentOrders = all(
    `SELECT
       o.order_id,
       o.order_datetime,
       o.order_total,
       CASE WHEN s.order_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.customer_id = ?
     ORDER BY o.order_datetime DESC
     LIMIT 5`,
    [customerId]
  );

  return { customer, stats, recentOrders };
}

export function getOrdersForCustomer(customerId) {
  return all(
    `SELECT
       o.order_id,
       o.order_datetime,
       o.order_total,
       CASE WHEN s.order_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.customer_id = ?
     ORDER BY o.order_datetime DESC`,
    [customerId]
  );
}

export function getOrderDetail(orderId, customerId) {
  const order = get(
    `SELECT
       o.order_id,
       o.customer_id,
       o.order_datetime,
       o.order_subtotal,
       o.shipping_fee,
       o.tax_amount,
       o.order_total,
       CASE WHEN s.order_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.order_id = ? AND o.customer_id = ?`,
    [orderId, customerId]
  );

  if (!order) {
    return null;
  }

  const items = all(
    `SELECT
       oi.order_item_id,
       oi.quantity,
       oi.unit_price,
       oi.line_total,
       p.product_name
     FROM order_items oi
     JOIN products p ON p.product_id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.order_item_id`,
    [orderId]
  );

  return { order, items };
}

export function getActiveProducts() {
  return all(
    `SELECT product_id, product_name, price
     FROM products
     WHERE is_active = 1
     ORDER BY product_name`
  );
}

export function createOrder(customerId, lineItems) {
  if (!lineItems.length) {
    throw new Error("Add at least one line item.");
  }

  const customer = getCustomerById(customerId);

  if (!customer) {
    throw new Error("The selected customer no longer exists.");
  }

  const productIds = [...new Set(lineItems.map((lineItem) => lineItem.productId))];
  const placeholders = productIds.map(() => "?").join(", ");
  const products = all(
    `SELECT product_id, product_name, price, is_active
     FROM products
     WHERE product_id IN (${placeholders})`,
    productIds
  );

  if (products.length !== productIds.length) {
    throw new Error("One or more selected products do not exist anymore.");
  }

  if (products.some((product) => product.is_active !== 1)) {
    throw new Error("One or more selected products are inactive.");
  }

  const productMap = new Map(products.map((product) => [product.product_id, product]));
  const pricedLineItems = lineItems.map((lineItem) => {
    const product = productMap.get(lineItem.productId);
    const unitPrice = Number(product.price);
    const quantity = Number(lineItem.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantities must be whole numbers greater than zero.");
    }

    return {
      productId: lineItem.productId,
      quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * quantity)
    };
  });

  const subtotal = roundMoney(
    pricedLineItems.reduce((sum, lineItem) => sum + lineItem.lineTotal, 0)
  );
  const shippingFee = subtotal >= 100 ? 0 : 8.99;
  const taxAmount = roundMoney(subtotal * 0.08);
  const orderTotal = roundMoney(subtotal + shippingFee + taxAmount);
  const timestamp = new Date().toISOString();

  return transaction(() => {
    const orderResult = run(
      `INSERT INTO orders (
         customer_id,
         order_datetime,
         billing_zip,
         shipping_zip,
         shipping_state,
         payment_method,
         device_type,
         ip_country,
         promo_used,
         promo_code,
         order_subtotal,
         shipping_fee,
         tax_amount,
         order_total,
         risk_score,
         is_fraud
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        timestamp,
        customer.zip_code || null,
        customer.zip_code || null,
        customer.state || null,
        "card",
        "desktop",
        "US",
        0,
        null,
        subtotal,
        shippingFee,
        taxAmount,
        orderTotal,
        0,
        0
      ]
    );

    const orderId = Number(orderResult.lastInsertRowid);

    for (const lineItem of pricedLineItems) {
      run(
        `INSERT INTO order_items (
           order_id,
           product_id,
           quantity,
           unit_price,
           line_total
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          orderId,
          lineItem.productId,
          lineItem.quantity,
          lineItem.unitPrice,
          lineItem.lineTotal
        ]
      );
    }

    return { orderId };
  });
}

export function getSchemaOverview() {
  return getSchemaDetails();
}

export function getPriorityQueue() {
  if (!tableExists("order_predictions")) {
    return {
      status: "missing_table",
      rows: []
    };
  }

  const requiredColumns = [
    "order_id",
    "late_delivery_probability",
    "predicted_late_delivery",
    "prediction_timestamp"
  ];
  const actualColumns = getTableColumns("order_predictions").map((column) => column.name);
  const missingColumns = requiredColumns.filter((column) => !actualColumns.includes(column));

  if (missingColumns.length > 0) {
    return {
      status: "schema_mismatch",
      rows: [],
      missingColumns
    };
  }

  return {
    status: "ready",
    rows: all(
      `SELECT
         o.order_id,
         o.order_datetime AS order_timestamp,
         o.order_total AS total_value,
         CASE WHEN s.order_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled,
         c.customer_id,
         c.full_name AS customer_name,
         p.late_delivery_probability,
         p.predicted_late_delivery,
         p.prediction_timestamp
       FROM orders o
       JOIN customers c ON c.customer_id = o.customer_id
       JOIN order_predictions p ON p.order_id = o.order_id
       LEFT JOIN shipments s ON s.order_id = o.order_id
       WHERE s.order_id IS NULL
       ORDER BY p.late_delivery_probability DESC, o.order_datetime ASC
       LIMIT 50`
    )
  };
}
