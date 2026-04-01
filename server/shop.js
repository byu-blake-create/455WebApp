import { getSupabaseAdmin, expectData } from "./supabase.js";

export const CUSTOMER_COOKIE = "selectedCustomerId";

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, chunk) => {
    const [key, ...rest] = chunk.trim().split("=");

    if (!key) {
      return cookies;
    }

    cookies[key] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function setCookieHeader(res, value) {
  const existing = res.getHeader ? res.getHeader("Set-Cookie") : undefined;
  const next = existing ? (Array.isArray(existing) ? [...existing, value] : [existing, value]) : value;

  if (res.setHeader) {
    res.setHeader("Set-Cookie", next);
  }
}

function isMissingRelationError(error) {
  return /does not exist|Could not find the table|relation .* does not exist/i.test(error.message);
}

function buildFulfilledMap(shipments) {
  return new Map(shipments.map((shipment) => [shipment.order_id, true]));
}

function mergeOrderFulfillment(orders, shipments) {
  const fulfilledMap = buildFulfilledMap(shipments);

  return orders.map((order) => ({
    ...order,
    fulfilled: fulfilledMap.has(order.order_id) ? 1 : 0
  }));
}

function parseOrderId(rawValue) {
  const orderId = Number.parseInt(String(rawValue || ""), 10);
  return Number.isNaN(orderId) ? null : orderId;
}

export function getCustomerIdFromRequest(req) {
  const cookieBag =
    req.cookies || parseCookies(req.headers?.cookie || req.headers?.Cookie || "");
  const rawValue = cookieBag[CUSTOMER_COOKIE];

  if (!rawValue) {
    return null;
  }

  const customerId = Number.parseInt(rawValue, 10);
  return Number.isNaN(customerId) ? null : customerId;
}

export function setCustomerCookie(res, customerId) {
  const cookie = `${CUSTOMER_COOKIE}=${encodeURIComponent(
    String(customerId)
  )}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax`;

  if (typeof res.cookie === "function") {
    res.cookie(CUSTOMER_COOKIE, String(customerId), {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: "/"
    });
    return;
  }

  setCookieHeader(res, cookie);
}

export function clearCustomerCookie(res) {
  const cookie = `${CUSTOMER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;

  if (typeof res.clearCookie === "function") {
    res.clearCookie(CUSTOMER_COOKIE);
    return;
  }

  setCookieHeader(res, cookie);
}

export async function searchCustomers(searchTerm = "") {
  const supabase = getSupabaseAdmin();
  const value = searchTerm.trim();
  let query = supabase
    .from("customers")
    .select("customer_id, full_name, email")
    .order("full_name", { ascending: true })
    .limit(50);

  if (value) {
    const safeValue = value.replace(/[%(),]/g, "");
    query = query.or(`full_name.ilike.%${safeValue}%,email.ilike.%${safeValue}%`);
  }

  const { data } = await expectData(query);
  return data;
}

export async function getCustomerById(customerId) {
  const supabase = getSupabaseAdmin();
  const { data } = await expectData(
    supabase
      .from("customers")
      .select("customer_id, full_name, email, city, state, zip_code")
      .eq("customer_id", customerId)
      .maybeSingle()
  );

  return data;
}

export async function getCurrentCustomer(req, res) {
  const customerId = getCustomerIdFromRequest(req);

  if (!customerId) {
    return null;
  }

  const customer = await getCustomerById(customerId);

  if (!customer) {
    clearCustomerCookie(res);
    return null;
  }

  return customer;
}

export async function getCustomerSummary(customerId) {
  const supabase = getSupabaseAdmin();
  const customer = await getCustomerById(customerId);

  if (!customer) {
    return null;
  }

  const { data: orders } = await expectData(
    supabase
      .from("orders")
      .select("order_id, order_datetime, order_total")
      .eq("customer_id", customerId)
      .order("order_datetime", { ascending: false })
  );

  const recentOrders = orders.slice(0, 5);
  const recentOrderIds = recentOrders.map((order) => order.order_id);
  const { data: shipments } = recentOrderIds.length
    ? await expectData(
        supabase.from("shipments").select("order_id").in("order_id", recentOrderIds)
      )
    : { data: [] };

  return {
    customer,
    stats: {
      totalOrders: orders.length,
      totalSpend: orders.reduce((sum, order) => sum + Number(order.order_total || 0), 0)
    },
    recentOrders: mergeOrderFulfillment(recentOrders, shipments || [])
  };
}

export async function getOrdersForCustomer(customerId) {
  const supabase = getSupabaseAdmin();
  const { data: orders } = await expectData(
    supabase
      .from("orders")
      .select("order_id, order_datetime, order_total")
      .eq("customer_id", customerId)
      .order("order_datetime", { ascending: false })
  );
  const orderIds = orders.map((order) => order.order_id);
  const { data: shipments } = orderIds.length
    ? await expectData(supabase.from("shipments").select("order_id").in("order_id", orderIds))
    : { data: [] };

  return mergeOrderFulfillment(orders, shipments || []);
}

export async function getOrderDetail(orderId, customerId) {
  const supabase = getSupabaseAdmin();
  const { data: order } = await expectData(
    supabase
      .from("orders")
      .select(
        "order_id, customer_id, order_datetime, order_subtotal, shipping_fee, tax_amount, order_total"
      )
      .eq("order_id", orderId)
      .eq("customer_id", customerId)
      .maybeSingle()
  );

  if (!order) {
    return null;
  }

  const { data: shipmentRows } = await expectData(
    supabase.from("shipments").select("order_id").eq("order_id", orderId)
  );

  const { data: items } = await expectData(
    supabase
      .from("order_items")
      .select("order_item_id, quantity, unit_price, line_total, product_id")
      .eq("order_id", orderId)
      .order("order_item_id", { ascending: true })
  );

  const productIds = items.map((item) => item.product_id);
  const { data: products } = productIds.length
    ? await expectData(
        supabase.from("products").select("product_id, product_name").in("product_id", productIds)
      )
    : { data: [] };
  const productMap = new Map(products.map((product) => [product.product_id, product.product_name]));

  return {
    order: {
      ...order,
      fulfilled: shipmentRows.length ? 1 : 0
    },
    items: items.map((item) => ({
      ...item,
      product_name: productMap.get(item.product_id) || `Product ${item.product_id}`
    }))
  };
}

export async function getActiveProducts() {
  const supabase = getSupabaseAdmin();
  const { data } = await expectData(
    supabase
      .from("products")
      .select("product_id, product_name, price")
      .eq("is_active", 1)
      .order("product_name", { ascending: true })
  );

  return data;
}

export async function createOrder(customerId, lineItems) {
  if (!lineItems.length) {
    throw new Error("Add at least one line item.");
  }

  const supabase = getSupabaseAdmin();
  const customer = await getCustomerById(customerId);

  if (!customer) {
    throw new Error("The selected customer no longer exists.");
  }

  const productIds = [...new Set(lineItems.map((lineItem) => lineItem.productId))];
  const { data: products } = await expectData(
    supabase
      .from("products")
      .select("product_id, product_name, price, is_active")
      .in("product_id", productIds)
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
    const quantity = Number(lineItem.quantity);

    if (!product) {
      throw new Error("One or more selected products do not exist anymore.");
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantities must be whole numbers greater than zero.");
    }

    const unitPrice = Number(product.price);

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

  const { data: insertedOrder } = await expectData(
    supabase
      .from("orders")
      .insert({
        customer_id: customerId,
        order_datetime: timestamp,
        billing_zip: customer.zip_code || null,
        shipping_zip: customer.zip_code || null,
        shipping_state: customer.state || null,
        payment_method: "card",
        device_type: "desktop",
        ip_country: "US",
        promo_used: 0,
        promo_code: null,
        order_subtotal: subtotal,
        shipping_fee: shippingFee,
        tax_amount: taxAmount,
        order_total: orderTotal,
        risk_score: 0,
        is_fraud: 0
      })
      .select("order_id")
      .single()
  );

  const orderId = insertedOrder.order_id;

  try {
    await expectData(
      supabase.from("order_items").insert(
        pricedLineItems.map((lineItem) => ({
          order_id: orderId,
          product_id: lineItem.productId,
          quantity: lineItem.quantity,
          unit_price: lineItem.unitPrice,
          line_total: lineItem.lineTotal
        }))
      )
    );
  } catch (error) {
    await supabase.from("orders").delete().eq("order_id", orderId);
    throw error;
  }

  return { orderId };
}

export async function getSchemaOverview() {
  const knownTables = [
    "customers",
    "orders",
    "order_items",
    "products",
    "shipments",
    "order_predictions"
  ];
  const supabase = getSupabaseAdmin();
  const schema = [];

  for (const table of knownTables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);

    if (error && isMissingRelationError(error)) {
      continue;
    }

    if (error) {
      throw new Error(error.message);
    }

    const sampleRow = data[0] || {};
    schema.push({
      name: table,
      columns: Object.keys(sampleRow).map((name) => ({
        name,
        type: "unknown",
        notnull: 0,
        dflt_value: null,
        pk: name.endsWith("_id") && name === `${table.slice(0, -1)}_id` ? 1 : 0
      }))
    });
  }

  return schema;
}

export async function getPriorityQueue() {
  const supabase = getSupabaseAdmin();
  const { data: predictions, error } = await supabase
    .from("order_predictions")
    .select("order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp")
    .order("late_delivery_probability", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        status: "missing_table",
        rows: []
      };
    }

    return {
      status: "schema_mismatch",
      rows: [],
      missingColumns: []
    };
  }

  const orderIds = predictions.map((row) => row.order_id);

  if (!orderIds.length) {
    return {
      status: "ready",
      rows: []
    };
  }

  const [{ data: orders }, { data: shipments }] = await Promise.all([
    expectData(
      supabase
        .from("orders")
        .select("order_id, customer_id, order_datetime, order_total")
        .in("order_id", orderIds)
    ),
    expectData(supabase.from("shipments").select("order_id").in("order_id", orderIds))
  ]);

  const shippedIds = new Set(shipments.map((shipment) => shipment.order_id));
  const openOrders = orders.filter((order) => !shippedIds.has(order.order_id));
  const customerIds = [...new Set(openOrders.map((order) => order.customer_id))];
  const { data: customers } = customerIds.length
    ? await expectData(
        supabase.from("customers").select("customer_id, full_name").in("customer_id", customerIds)
      )
    : { data: [] };

  const customerMap = new Map(customers.map((customer) => [customer.customer_id, customer.full_name]));
  const orderMap = new Map(openOrders.map((order) => [order.order_id, order]));

  const rows = predictions
    .map((prediction) => {
      const order = orderMap.get(prediction.order_id);

      if (!order) {
        return null;
      }

      return {
        order_id: order.order_id,
        order_timestamp: order.order_datetime,
        total_value: order.order_total,
        fulfilled: 0,
        customer_id: order.customer_id,
        customer_name: customerMap.get(order.customer_id) || `Customer ${order.customer_id}`,
        late_delivery_probability: prediction.late_delivery_probability,
        predicted_late_delivery: prediction.predicted_late_delivery,
        prediction_timestamp: prediction.prediction_timestamp
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const probabilityDelta =
        Number(right.late_delivery_probability) - Number(left.late_delivery_probability);

      if (probabilityDelta !== 0) {
        return probabilityDelta;
      }

      return new Date(left.order_timestamp).getTime() - new Date(right.order_timestamp).getTime();
    })
    .slice(0, 50);

  return {
    status: "ready",
    rows
  };
}

export async function getCustomerOrThrow(req, res) {
  const customerId = getCustomerIdFromRequest(req);

  if (!customerId) {
    return { error: "No customer selected." };
  }

  const customer = await getCustomerById(customerId);

  if (!customer) {
    clearCustomerCookie(res);
    return { error: "Selected customer no longer exists." };
  }

  return { customer };
}

export function getOrderIdFromParams(req) {
  if (req.params?.orderId) {
    return parseOrderId(req.params.orderId);
  }

  const url = new URL(req.url, "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  return parseOrderId(segments[segments.length - 1]);
}
