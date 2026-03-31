from __future__ import annotations

import sqlite3
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.exceptions import InconsistentVersionWarning

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PROJECT_ROOT / "shop.db"
MODEL_PATH = PROJECT_ROOT / "jobs" / "models" / "late_delivery_model.sav"
PREDICTIONS_TABLE = "order_predictions"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_predictions_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {PREDICTIONS_TABLE} (
          order_id INTEGER PRIMARY KEY,
          late_delivery_probability REAL NOT NULL,
          predicted_late_delivery INTEGER NOT NULL,
          prediction_timestamp TEXT NOT NULL,
          model_artifact TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(order_id)
        )
        """
    )


def load_open_orders(connection: sqlite3.Connection) -> pd.DataFrame:
    query = """
        SELECT
          o.order_id,
          o.order_datetime,
          o.billing_zip,
          o.shipping_zip,
          o.shipping_state,
          o.payment_method,
          o.device_type,
          o.ip_country,
          o.promo_used,
          o.promo_code,
          o.order_subtotal,
          o.shipping_fee,
          o.tax_amount,
          o.order_total,
          c.gender,
          c.birthdate,
          c.state,
          c.zip_code,
          c.customer_segment,
          c.loyalty_tier,
          c.is_active,
          s.carrier,
          s.shipping_method,
          s.distance_band,
          s.promised_days,
          oi.num_items,
          oi.avg_unit_price,
          oi.total_items_value,
          oi.num_distinct_products
        FROM orders o
        JOIN customers c
          ON c.customer_id = o.customer_id
        LEFT JOIN shipments s
          ON s.order_id = o.order_id
        LEFT JOIN (
          SELECT
            order_id,
            SUM(quantity) AS num_items,
            AVG(unit_price) AS avg_unit_price,
            SUM(line_total) AS total_items_value,
            COUNT(DISTINCT product_id) AS num_distinct_products
          FROM order_items
          GROUP BY order_id
        ) oi
          ON oi.order_id = o.order_id
        WHERE s.order_id IS NULL
        ORDER BY o.order_datetime DESC
    """
    return pd.read_sql_query(query, connection)


def build_features(df: pd.DataFrame, expected_columns: list[str]) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=expected_columns)

    features = df.copy()
    order_ts = pd.to_datetime(features["order_datetime"], errors="coerce")
    birthdates = pd.to_datetime(features["birthdate"], errors="coerce")

    features["order_dow"] = order_ts.dt.dayofweek
    features["order_month"] = order_ts.dt.month
    features["customer_age"] = ((order_ts - birthdates).dt.days / 365.25).astype("float64")

    features = features.drop(columns=["order_datetime", "birthdate"], errors="ignore")

    for column in expected_columns:
        if column not in features.columns:
            features[column] = pd.NA

    return features[expected_columns]


def load_model():
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
    return joblib.load(MODEL_PATH)


def score_orders(model, features: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    probabilities = model.predict_proba(features)
    positive_index = list(model.classes_).index(1)
    late_probabilities = pd.Series(probabilities[:, positive_index], index=features.index)
    predicted_labels = pd.Series(model.predict(features), index=features.index)
    return late_probabilities, predicted_labels


def write_predictions(
    connection: sqlite3.Connection,
    order_ids: pd.Series,
    probabilities: pd.Series,
    predictions: pd.Series,
) -> int:
    prediction_timestamp = utc_now_iso()
    rows = [
        (
            int(order_id),
            float(probability),
            int(predicted),
            prediction_timestamp,
            str(MODEL_PATH.relative_to(PROJECT_ROOT)),
        )
        for order_id, probability, predicted in zip(order_ids, probabilities, predictions)
    ]

    connection.executemany(
        f"""
        INSERT INTO {PREDICTIONS_TABLE} (
          order_id,
          late_delivery_probability,
          predicted_late_delivery,
          prediction_timestamp,
          model_artifact
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(order_id) DO UPDATE SET
          late_delivery_probability = excluded.late_delivery_probability,
          predicted_late_delivery = excluded.predicted_late_delivery,
          prediction_timestamp = excluded.prediction_timestamp,
          model_artifact = excluded.model_artifact
        """,
        rows,
    )
    connection.commit()
    return len(rows)


def main() -> None:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Missing SQLite database at {DB_PATH}")

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Missing model artifact at {MODEL_PATH}")

    model = load_model()
    expected_columns = list(getattr(model, "feature_names_in_", []))

    if not expected_columns:
        raise ValueError("Loaded model does not expose feature_names_in_.")

    with sqlite3.connect(DB_PATH) as connection:
        ensure_predictions_table(connection)
        open_orders = load_open_orders(connection)

        if open_orders.empty:
            print("Orders scored: 0")
            print("No open orders without shipments were found.")
            return

        features = build_features(open_orders, expected_columns)
        probabilities, predictions = score_orders(model, features)
        scored_count = write_predictions(
            connection,
            open_orders["order_id"],
            probabilities,
            predictions,
        )

    print(f"Orders scored: {scored_count}")
    print(f"Prediction table: {PREDICTIONS_TABLE}")
    print(f"Model artifact: {MODEL_PATH.name}")


if __name__ == "__main__":
    main()
