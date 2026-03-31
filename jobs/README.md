Place your Python inference entrypoint at `jobs/run_inference.py`.

The Next.js scoring page runs:

```bash
python jobs/run_inference.py
```

The script is expected to write predictions into an `order_predictions` table keyed by `order_id`.
