"""SHAP-based model explainability for credit scoring predictions.

Uses SHAP TreeExplainer for XGBoost models to provide per-prediction
explanations and model-wide feature importance.
"""

from typing import Optional

import numpy as np

from app.models.feature_engineering import transform_features, get_feature_names
from app.config import settings


def explain_prediction(
    model,
    features: dict,
    top_n: int = 5,
    include_wallet: bool = False,
) -> list[dict]:
    """Explain a single prediction using SHAP values.

    Args:
        model: A trained XGBoost model (XGBClassifier).
        features: Raw customer feature dictionary.
        top_n: Number of top contributing factors to return.
        include_wallet: Whether wallet features are included.

    Returns:
        List of dicts with 'feature_name', 'shap_value', and 'direction'
        ('positive' increases default risk, 'negative' decreases it),
        sorted by absolute SHAP value descending.
    """
    import shap

    feature_vector = transform_features(features, include_wallet=include_wallet, normalize=True)
    feature_vector_2d = feature_vector.reshape(1, -1)

    # Use TreeExplainer for XGBoost
    max_samples = settings.shap_max_samples
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(feature_vector_2d)

    # shap_values shape: (1, n_features) for binary classification
    if isinstance(shap_values, list):
        # For older SHAP versions that return [class_0, class_1]
        sv = shap_values[1][0] if len(shap_values) > 1 else shap_values[0][0]
    else:
        sv = shap_values[0]

    feature_names = get_feature_names(include_wallet=include_wallet)
    explanations = []
    for i, shap_val in enumerate(sv):
        if i < len(feature_names):
            explanations.append({
                "feature_name": feature_names[i],
                "shap_value": round(float(shap_val), 6),
                "direction": "positive" if shap_val > 0 else "negative",
            })

    # Sort by absolute SHAP value
    explanations.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
    return explanations[:top_n]


def get_feature_importance(
    model,
    training_data: Optional[np.ndarray] = None,
    include_wallet: bool = False,
    max_samples: Optional[int] = None,
) -> list[dict]:
    """Calculate global feature importance using SHAP.

    Args:
        model: A trained XGBoost model.
        training_data: Optional training data matrix for SHAP analysis.
            If None, uses the model's built-in feature importance.
        include_wallet: Whether wallet features are included.
        max_samples: Max samples to use for SHAP (for performance).

    Returns:
        List of dicts with 'feature_name' and 'importance', sorted descending.
    """
    feature_names = get_feature_names(include_wallet=include_wallet)

    if training_data is not None:
        import shap

        if max_samples is None:
            max_samples = settings.shap_max_samples

        # Subsample if dataset is large
        if len(training_data) > max_samples:
            indices = np.random.choice(len(training_data), max_samples, replace=False)
            sample_data = training_data[indices]
        else:
            sample_data = training_data

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(sample_data)

        if isinstance(shap_values, list):
            sv = shap_values[1] if len(shap_values) > 1 else shap_values[0]
        else:
            sv = shap_values

        # Mean absolute SHAP value per feature
        mean_abs = np.mean(np.abs(sv), axis=0)
        total = np.sum(mean_abs)
        importances = []
        for i, imp in enumerate(mean_abs):
            if i < len(feature_names):
                normalized = float(imp / total) if total > 0 else 0.0
                importances.append({
                    "feature_name": feature_names[i],
                    "importance": round(normalized, 6),
                })
    else:
        # Fallback to XGBoost's built-in feature importance
        raw_importances = model.feature_importances_
        importances = []
        for i, imp in enumerate(raw_importances):
            if i < len(feature_names):
                importances.append({
                    "feature_name": feature_names[i],
                    "importance": round(float(imp), 6),
                })

    importances.sort(key=lambda x: x["importance"], reverse=True)
    return importances
