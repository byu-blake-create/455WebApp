The scoring page runs:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-scoring.txt
.venv/bin/python jobs/run_inference.py
```

This project includes:

- `jobs/run_inference.py`: local inference job for the web app
- `jobs/models/late_delivery_model.sav`: copied model artifact
- `jobs/train_model_reference.py`: original training script reference

The inference job writes predictions into an `order_predictions` table keyed by `order_id`.
