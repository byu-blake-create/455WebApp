-- Late delivery scores for the warehouse priority queue.
-- Safe to run once per project. The app can upsert rows via the service role;
-- an external ML pipeline can replace or extend the same rows.

CREATE TABLE IF NOT EXISTS public.order_predictions (
  order_id bigint NOT NULL PRIMARY KEY REFERENCES public.orders (order_id) ON DELETE CASCADE,
  late_delivery_probability double precision NOT NULL,
  predicted_late_delivery integer NOT NULL,
  prediction_timestamp timestamptz NOT NULL DEFAULT now(),
  model_artifact text
);

CREATE INDEX IF NOT EXISTS idx_order_predictions_late_prob
  ON public.order_predictions (late_delivery_probability DESC);

ALTER TABLE public.order_predictions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.order_predictions IS
  'Per-order late delivery risk; filled by Run Scoring in the app or an external pipeline.';
