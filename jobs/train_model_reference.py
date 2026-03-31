from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

from lab.shop_ml.src.config import ID_COL, LEAKAGE_COLS, PATHS, RANDOM_SEED, TARGET_COL
from lab.shop_ml.src.evaluation import evaluate_classifier
from lab.shop_ml.src.modeling import candidate_models, make_preprocessor


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    PATHS.artifacts_models.mkdir(parents=True, exist_ok=True)
    PATHS.artifacts_runs.mkdir(parents=True, exist_ok=True)

    warehouse_path = PATHS.data_processed / "warehouse_orders.parquet"
    if not warehouse_path.exists():
        raise FileNotFoundError(f"Missing warehouse at {warehouse_path}. Run jobs/etl_build_warehouse.py first.")

    df = pd.read_parquet(warehouse_path)
    if TARGET_COL not in df.columns:
        raise ValueError(f"Missing target column {TARGET_COL}")

    # Drop leakage + ids
    drop_cols = set(LEAKAGE_COLS) | {ID_COL, "shipment_id", "customer_id"}
    X = df.drop(columns=[c for c in drop_cols if c in df.columns], errors="ignore")
    y = df[TARGET_COL].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_SEED,
        stratify=y,
    )

    preprocessor = make_preprocessor(X_train)
    models = candidate_models(preprocessor, seed=RANDOM_SEED)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    scoring = "roc_auc"

    cv_rows: list[dict] = []
    for name, pipe in models.items():
        scores = cross_val_score(pipe, X_train, y_train, cv=cv, scoring=scoring, n_jobs=-1)
        cv_rows.append(
            {
                "model": name,
                "scoring": scoring,
                "cv_mean": float(np.mean(scores)),
                "cv_std": float(np.std(scores)),
            }
        )

    cv_df = pd.DataFrame(cv_rows).sort_values("cv_mean", ascending=False)
    best_name = cv_df.iloc[0]["model"]
    best_model = models[str(best_name)]

    best_model.fit(X_train, y_train)
    test_metrics = evaluate_classifier(best_model, X_test=X_test, y_test=y_test)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_path = PATHS.artifacts_models / f"late_delivery_model_{run_id}.joblib"
    run_dir = PATHS.artifacts_runs / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(best_model, model_path)
    cv_df.to_csv(run_dir / "cv_scores.csv", index=False)

    metadata = {
        "run_id": run_id,
        "trained_at_utc": utc_now_iso(),
        "target": TARGET_COL,
        "id_col": ID_COL,
        "leakage_cols_dropped": sorted(list(LEAKAGE_COLS)),
        "best_model": str(best_name),
        "cv_scoring": scoring,
        "model_artifact": str(model_path),
        "n_rows": int(df.shape[0]),
        "n_features_input": int(X.shape[1]),
        "train_rows": int(X_train.shape[0]),
        "test_rows": int(X_test.shape[0]),
        "test_metrics": test_metrics,
    }
    (run_dir / "model_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (run_dir / "metrics.json").write_text(json.dumps(test_metrics, indent=2), encoding="utf-8")

    print("Best model:", best_name)
    print("CV scores:\n", cv_df.to_string(index=False))
    print("Test metrics:\n", json.dumps(test_metrics, indent=2))
    print("Saved model:", model_path)
    print("Run dir:", run_dir)


if __name__ == "__main__":
    main()

