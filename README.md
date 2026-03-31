# Shop ML Pipeline Demo

Simple Vite + Node.js web app backed by the existing `shop.db` SQLite database. The frontend is a Vite React SPA, and the backend is an Express server that reads and writes directly to the operational database.

## Stack

- Vite + React
- Node.js + Express
- `better-sqlite3`
- SQLite database file at `/Users/noahblake/Downloads/455WebApp/shop.db`

## Real schema notes

The database in this project differs from the original prompt examples:

- `customers` uses `full_name` instead of separate first and last name fields
- `orders` uses `order_datetime` and `order_total`
- `orders` does not have a `fulfilled` column, so the UI derives fulfillment from whether a row exists in `shipments`
- `order_predictions` does not exist yet, so the warehouse queue and scoring screens show a friendly warning until your ML pipeline adds that table and writes predictions

## Run in development

1. Install dependencies:

```bash
npm install
```

2. Start the backend and Vite frontend together:

```bash
npm run dev
```

3. Open the Vite app:

```text
http://localhost:5173
```

The Express API runs on `http://127.0.0.1:3000` and Vite proxies `/api` requests to it in development.

## Production build

```bash
npm run build
npm start
```

`npm start` serves the built `dist/` frontend from Express along with the API routes.

## Expected scoring script

The scoring API executes this command from the project root:

```bash
.venv/bin/python jobs/run_inference.py
```

This repo now includes:

- `jobs/run_inference.py`
- `jobs/models/late_delivery_model.sav`
- `jobs/train_model_reference.py`

The inference job creates or updates `order_predictions` keyed by `order_id`. It scores open orders that do not yet have a shipment row.

## Python scoring setup

The scoring job expects a local virtual environment at `.venv` with:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-scoring.txt
```

## Main routes

- `/select-customer`
- `/dashboard`
- `/place-order`
- `/orders`
- `/orders/:orderId`
- `/warehouse/priority`
- `/scoring`
- `/debug/schema`

## Manual QA checklist

1. Open `/select-customer` and choose a customer.
2. Confirm the selected customer banner appears throughout the app.
3. Open `/dashboard` and verify summary metrics load from the database.
4. Open `/place-order`, add products, and submit a new order.
5. Open `/orders` and confirm the new order appears with a success message.
6. Open the order detail page and verify line items and totals.
7. Open `/scoring` and run the inference script after you add `jobs/run_inference.py`.
8. Open `/warehouse/priority` and confirm scored unshipped orders appear after predictions are written.
9. Open `/debug/schema` to inspect the actual SQLite schema.
