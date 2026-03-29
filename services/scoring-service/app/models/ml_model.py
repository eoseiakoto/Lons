"""XGBoost ML model wrapper for credit scoring.

Provides training, prediction, serialization and deserialization of
gradient-boosted tree models for credit scoring. All monetary outputs
are returned as strings (Decimal) per platform rules.
"""

import pickle
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any, Optional

import numpy as np
import xgboost as xgb

from app.models.feature_engineering import transform_features, get_feature_names


# Risk tiers based on score ranges
RISK_TIERS = [
    (750, "low"),
    (500, "medium"),
    (300, "high"),
    (0, "critical"),
]

# Limit multipliers based on score bands
LIMIT_BANDS = [
    (800, 1000, Decimal("5.0")),
    (600, 799, Decimal("3.0")),
    (400, 599, Decimal("1.5")),
    (0, 399, Decimal("0.0")),
]


class MLModel:
    """Wrapper around XGBoost for credit scoring predictions.

    Attributes:
        model: The underlying XGBoost Booster or sklearn-compatible model.
        feature_names: Ordered list of features the model was trained on.
        params: Hyperparameters used during training.
        metrics: Training metrics (AUC, accuracy, etc.).
    """

    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self.feature_names: list[str] = []
        self.params: dict = {}
        self.metrics: dict = {}

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        params: Optional[dict] = None,
    ) -> dict:
        """Train an XGBoost classifier on the provided data.

        Args:
            X: 2D feature matrix of shape (n_samples, n_features).
            y: Binary target array (0 = no default, 1 = default).
            params: XGBoost hyperparameters. Defaults to reasonable values.

        Returns:
            Dictionary of training metrics.
        """
        default_params = {
            "n_estimators": 100,
            "max_depth": 6,
            "learning_rate": 0.1,
            "subsample": 0.8,
            "objective": "binary:logistic",
            "eval_metric": "auc",
            "use_label_encoder": False,
            "random_state": 42,
        }
        if params:
            default_params.update(params)

        self.params = default_params

        # Extract sklearn-compatible params
        model_params = {
            k: v for k, v in default_params.items()
            if k in {
                "n_estimators", "max_depth", "learning_rate", "subsample",
                "objective", "eval_metric", "use_label_encoder", "random_state",
                "colsample_bytree", "min_child_weight", "gamma", "reg_alpha", "reg_lambda",
            }
        }

        self.model = xgb.XGBClassifier(**model_params)
        self.model.fit(X, y)

        # Calculate metrics
        y_pred_proba = self.model.predict_proba(X)[:, 1]
        y_pred = self.model.predict(X)

        from sklearn.metrics import roc_auc_score, accuracy_score, precision_score, recall_score

        self.metrics = {
            "auc": round(float(roc_auc_score(y, y_pred_proba)), 4),
            "accuracy": round(float(accuracy_score(y, y_pred)), 4),
            "precision": round(float(precision_score(y, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y, y_pred, zero_division=0)), 4),
            "num_samples": int(len(y)),
            "positive_rate": round(float(np.mean(y)), 4),
        }

        return self.metrics

    def predict(self, features: dict[str, Any]) -> dict:
        """Generate a credit score prediction for a single customer.

        Args:
            features: Raw customer feature dictionary.

        Returns:
            Dictionary with score, probability_of_default, recommended_limit
            (as string), confidence, risk_tier, and contributing_factors.

        Raises:
            RuntimeError: If the model has not been trained or loaded.
        """
        if self.model is None:
            raise RuntimeError("Model not trained or loaded. Call train() or load() first.")

        # Transform features
        include_wallet = len(self.feature_names) > len(get_feature_names(include_wallet=False))
        feature_vector = transform_features(features, include_wallet=include_wallet, normalize=True)
        feature_vector_2d = feature_vector.reshape(1, -1)

        # Get probability of default
        pd_value = float(self.model.predict_proba(feature_vector_2d)[0, 1])
        pd_value = max(0.0, min(1.0, pd_value))

        # Convert PD to score (0-1000 scale, higher = better)
        score = round((1.0 - pd_value) * 1000, 2)

        # Risk tier
        risk_tier = "critical"
        for min_score, tier in RISK_TIERS:
            if score >= min_score:
                risk_tier = tier
                break

        # Recommended limit (using Decimal for monetary precision)
        requested_amount = Decimal(str(features.get("requested_amount", "1000")))
        multiplier = Decimal("0.0")
        for band_min, band_max, mult in LIMIT_BANDS:
            if band_min <= score <= band_max:
                multiplier = mult
                break
        recommended_limit = (requested_amount * multiplier).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_EVEN
        )

        # Confidence based on model's prediction margin
        proba = self.model.predict_proba(feature_vector_2d)[0]
        confidence = round(float(abs(proba[0] - proba[1])), 4)

        # Feature importances as contributing factors
        importances = self.model.feature_importances_
        feature_names = get_feature_names(include_wallet=include_wallet)
        contributing = []
        for i, imp in enumerate(importances):
            if i < len(feature_names) and imp > 0:
                contributing.append({
                    "name": feature_names[i],
                    "impact": round(float(imp), 4),
                })
        contributing.sort(key=lambda x: abs(x["impact"]), reverse=True)

        return {
            "score": score,
            "probability_of_default": round(pd_value, 4),
            "recommended_limit": str(recommended_limit),
            "confidence": confidence,
            "risk_tier": risk_tier,
            "contributing_factors": contributing[:5],
        }

    def predict_batch(self, features_list: list[dict[str, Any]]) -> list[dict]:
        """Generate predictions for a batch of customers.

        Args:
            features_list: List of raw feature dictionaries.

        Returns:
            List of prediction result dictionaries.
        """
        return [self.predict(f) for f in features_list]

    def save(self, path: str) -> None:
        """Serialize the model to a pickle file.

        Args:
            path: File path to save the model to.

        Raises:
            RuntimeError: If the model has not been trained.
        """
        if self.model is None:
            raise RuntimeError("No model to save. Train a model first.")

        filepath = Path(path)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "model": self.model,
            "feature_names": self.feature_names,
            "params": self.params,
            "metrics": self.metrics,
        }
        with open(filepath, "wb") as f:
            pickle.dump(data, f)

    def load(self, path: str) -> None:
        """Deserialize a model from a pickle file.

        Args:
            path: File path to load the model from.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        filepath = Path(path)
        if not filepath.exists():
            raise FileNotFoundError(f"Model file not found: {path}")

        with open(filepath, "rb") as f:
            data = pickle.load(f)

        self.model = data["model"]
        self.feature_names = data.get("feature_names", [])
        self.params = data.get("params", {})
        self.metrics = data.get("metrics", {})
