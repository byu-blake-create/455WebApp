import { getSupabaseAdmin } from "./supabase.js";

function isMissingRelationError(error) {
  return /does not exist|Could not find the table|relation .* does not exist/i.test(error.message);
}

function numericId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Deterministic in-app risk score (0–1) for unshipped orders so Run Scoring works on Vercel
 * without Python. Rows can be overwritten later by an external ML pipeline.
 */
function computeLateRisk(order, itemAgg) {
  const total = Number(order.order_total) || 0;
  const subtotal = Number(order.order_subtotal) || 0;
  const numItems = itemAgg.num_items || 0;
  const distinct = itemAgg.num_distinct_products || 0;

  const totalScore = Math.min(total / 500, 1) * 0.28;
  const itemsScore = Math.min(numItems / 24, 1) * 0.28;
  const distinctScore = Math.min(distinct / 12, 1) * 0.18;
  const shippingScore = Number(order.shipping_fee) > 0 ? 0.12 : 0.06;
  const taxRatio =
    subtotal > 0
      ? (Math.min(Number(order.tax_amount) / subtotal, 0.25) / 0.25) * 0.08
      : 0;

  let probability = totalScore + itemsScore + distinctScore + shippingScore + taxRatio;
  const spread = ((Number(order.order_id) % 13) / 13) * 0.08;
  probability = Math.min(0.96, Math.max(0.04, probability + spread - 0.04));
  const predicted_late_delivery = probability >= 0.5 ? 1 : 0;

  return { late_delivery_probability: probability, predicted_late_delivery };
}

async function loadOrderItemAggregates(supabase, orderIds) {
  const map = new Map();

  for (const ids of chunk(orderIds, 120)) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, product_id, quantity, line_total")
      .in("order_id", ids);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data || []) {
      const oid = numericId(row.order_id);
      const cur = map.get(oid) || {
        num_items: 0,
        num_distinct_products: new Set()
      };
      cur.num_items += Number(row.quantity) || 0;
      cur.num_distinct_products.add(row.product_id);
      map.set(oid, cur);
    }
  }

  return map;
}

/**
 * Scores every unshipped order and upserts into order_predictions.
 * @returns {Promise<{ ok: boolean, message: string, ordersScored: number | null, ranAt: string, stdout: string, stderr: string }>}
 */
export async function runOrderScoring() {
  const ranAt = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { error: probeError } = await supabase.from("order_predictions").select("order_id").limit(1);

  if (probeError && isMissingRelationError(probeError)) {
    return {
      ok: false,
      message:
        "The order_predictions table is missing. Open the Supabase SQL Editor and run supabase/migrations/20260401120000_create_order_predictions.sql, then try again.",
      ordersScored: null,
      ranAt,
      stdout: "",
      stderr: ""
    };
  }

  if (probeError) {
    throw new Error(probeError.message);
  }

  const { data: shipments, error: shipErr } = await supabase.from("shipments").select("order_id");

  if (shipErr) {
    throw new Error(shipErr.message);
  }

  const shippedIds = new Set((shipments || []).map((s) => numericId(s.order_id)));

  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "order_id, order_subtotal, shipping_fee, tax_amount, order_total"
    )
    .order("order_datetime", { ascending: false });

  if (ordersErr) {
    throw new Error(ordersErr.message);
  }

  const openOrders = (orders || []).filter((o) => !shippedIds.has(numericId(o.order_id)));

  if (!openOrders.length) {
    return {
      ok: true,
      message: "No unshipped orders to score.",
      ordersScored: 0,
      ranAt,
      stdout: "",
      stderr: ""
    };
  }

  const orderIds = openOrders.map((o) => o.order_id);
  const aggMap = await loadOrderItemAggregates(supabase, orderIds);

  const predictionTimestamp = ranAt;
  const rows = openOrders.map((order) => {
    const raw = aggMap.get(numericId(order.order_id));
    const itemAgg = raw
      ? { num_items: raw.num_items, num_distinct_products: raw.num_distinct_products.size }
      : { num_items: 0, num_distinct_products: 0 };

    const { late_delivery_probability, predicted_late_delivery } = computeLateRisk(order, itemAgg);

    return {
      order_id: order.order_id,
      late_delivery_probability,
      predicted_late_delivery,
      prediction_timestamp: predictionTimestamp,
      model_artifact: "in_app_heuristic_v1"
    };
  });

  let upserted = 0;
  for (const batch of chunk(rows, 200)) {
    const { error: upErr } = await supabase.from("order_predictions").upsert(batch, {
      onConflict: "order_id"
    });

    if (upErr) {
      throw new Error(upErr.message);
    }

    upserted += batch.length;
  }

  return {
    ok: true,
    message:
      "Scoring finished. Open unshipped orders were upserted into order_predictions (in-app heuristic). Replace with your ML pipeline anytime.",
    ordersScored: upserted,
    ranAt,
    stdout: "",
    stderr: ""
  };
}
