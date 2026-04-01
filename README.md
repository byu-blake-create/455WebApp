# Shop ML Pipeline Demo

Simple Vite web app backed by Supabase. The frontend is a Vite React SPA, and the deployed app uses Vercel API routes plus the Supabase service role key for server-side CRUD.

## Stack

- Vite + React
- Vercel API routes
- Supabase
- `@supabase/supabase-js`

## Required environment variables

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`VITE_...` variables are exposed to the browser. `SUPABASE_SERVICE_ROLE_KEY` must remain server-only.

## Real schema notes

The imported schema differs from the original prompt examples:

- `customers` uses `full_name` instead of separate first and last name fields
- `orders` uses `order_datetime` and `order_total`
- `orders` does not have a `fulfilled` column, so the UI derives fulfillment from whether a row exists in `shipments`
- the deployed app expects `order_predictions` to be populated by your external pipeline

## Run in development

1. Install dependencies:

```bash
npm install
```

2. Start the local API server and Vite frontend together:

```bash
npm run dev
```

3. Open the Vite app:

```text
http://localhost:5173
```

The local API runs on `http://127.0.0.1:3000` and Vite proxies `/api` requests to it in development.

## Production build

```bash
npm run build
```

The Vite build outputs `dist/`. On Vercel, the frontend is served statically and the `/api` routes run as serverless functions.

## ML pipeline assets

This repo includes:

- `jobs/run_inference.py`
- `jobs/models/late_delivery_model.sav`
- `jobs/train_model_reference.py`

The Python assets are kept for reference and local experimentation. The deployed app itself does not execute Python on Vercel; it reads `order_predictions` from Supabase after your external pipeline writes them.

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
3. Open `/dashboard` and verify summary metrics load from Supabase.
4. Open `/place-order`, add products, and submit a new order.
5. Open `/orders` and confirm the new order appears with a success message.
6. Open the order detail page and verify line items and totals.
7. Run your external scoring pipeline so it writes into `order_predictions` in Supabase.
8. Open `/warehouse/priority` and confirm scored unshipped orders appear after predictions are written.
9. Open `/debug/schema` to inspect the tables exposed through the app.
