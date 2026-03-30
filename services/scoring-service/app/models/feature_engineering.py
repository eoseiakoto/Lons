"""Feature engineering pipeline for ML credit scoring.

Transforms raw customer features into ML-ready feature vectors with support
for temporal features, categorical encoding, and graceful degradation when
wallet features are unavailable.
"""

from typing import Any
import numpy as np

# Flag to control whether wallet-specific features are expected.
# When False, wallet features are silently skipped during transformation.
WALLET_FEATURES_AVAILABLE = False

# Core features that are always expected
CORE_FEATURES = [
    "account_age_days",
    "kyc_level",
    "payment_history_pct",
    "transaction_frequency",
    "existing_debt_ratio",
    "income_consistency",
]

# Wallet-specific features (only used when WALLET_FEATURES_AVAILABLE is True)
WALLET_FEATURES = [
    "wallet_balance_avg_30d",
    "wallet_transaction_count_30d",
    "wallet_inflow_outflow_ratio",
    "wallet_unique_receivers",
    "wallet_max_single_transaction",
]

# Temporal feature definitions
TEMPORAL_FEATURES = [
    "spending_trend_3m",
    "income_seasonality_index",
    "transaction_velocity_change",
]

# Categorical features and their known categories
CATEGORICAL_FEATURES = {
    "kyc_level": [0, 1, 2, 3],
    "employment_type": ["salaried", "self_employed", "informal", "unemployed", "unknown"],
    "loan_purpose": ["personal", "business", "education", "medical", "agriculture", "other"],
}


def get_feature_names(include_wallet: bool = None) -> list[str]:
    """Return the full list of feature names used by the ML model.

    Args:
        include_wallet: Whether to include wallet features. If None, uses the
            module-level WALLET_FEATURES_AVAILABLE flag.

    Returns:
        Ordered list of feature names.
    """
    if include_wallet is None:
        include_wallet = WALLET_FEATURES_AVAILABLE

    features = list(CORE_FEATURES)
    if include_wallet:
        features.extend(WALLET_FEATURES)
    features.extend(TEMPORAL_FEATURES)
    # Add one-hot encoded columns for categorical features
    for feat, categories in CATEGORICAL_FEATURES.items():
        if feat in features:
            # Replace original with one-hot
            continue
        for cat in categories:
            features.append(f"{feat}_{cat}")
    return features


def normalize_value(value: float, min_val: float, max_val: float) -> float:
    """Min-max normalize a value to [0, 1].

    Args:
        value: The raw value.
        min_val: Minimum of the expected range.
        max_val: Maximum of the expected range.

    Returns:
        Normalized value clamped to [0, 1].
    """
    if max_val == min_val:
        return 0.0
    normalized = (value - min_val) / (max_val - min_val)
    return max(0.0, min(1.0, normalized))


# Normalization ranges for core numeric features
NORMALIZATION_RANGES = {
    "account_age_days": (0, 1825),      # 0 to 5 years
    "kyc_level": (0, 3),
    "payment_history_pct": (0, 100),
    "transaction_frequency": (0, 100),
    "existing_debt_ratio": (0, 100),
    "income_consistency": (0, 100),
    "wallet_balance_avg_30d": (0, 100000),
    "wallet_transaction_count_30d": (0, 500),
    "wallet_inflow_outflow_ratio": (0, 5),
    "wallet_unique_receivers": (0, 100),
    "wallet_max_single_transaction": (0, 50000),
    "spending_trend_3m": (-1, 1),
    "income_seasonality_index": (0, 1),
    "transaction_velocity_change": (-1, 1),
}


def encode_categorical(raw_features: dict[str, Any], feature: str, categories: list) -> dict[str, float]:
    """One-hot encode a categorical feature.

    Args:
        raw_features: Raw feature dictionary.
        feature: Feature name.
        categories: List of known category values.

    Returns:
        Dictionary mapping one-hot column names to 0.0 or 1.0.
    """
    value = raw_features.get(feature, categories[-1] if categories else None)
    result = {}
    for cat in categories:
        col_name = f"{feature}_{cat}"
        result[col_name] = 1.0 if value == cat else 0.0
    return result


def compute_temporal_features(raw_features: dict[str, Any]) -> dict[str, float]:
    """Compute temporal/trend features from raw data.

    Gracefully returns 0.0 for any feature that cannot be computed
    from the available raw data.

    Args:
        raw_features: Raw feature dictionary, which may contain time-series
            arrays like 'monthly_spending' or 'monthly_income'.

    Returns:
        Dictionary of temporal feature values.
    """
    result = {}

    # Spending trend: slope of spending over last 3 months
    monthly_spending = raw_features.get("monthly_spending", [])
    if isinstance(monthly_spending, list) and len(monthly_spending) >= 2:
        # Simple linear trend: positive = increasing spending
        diffs = [monthly_spending[i] - monthly_spending[i - 1] for i in range(1, len(monthly_spending))]
        avg_diff = sum(diffs) / len(diffs)
        avg_spend = sum(monthly_spending) / len(monthly_spending) if sum(monthly_spending) > 0 else 1
        result["spending_trend_3m"] = max(-1.0, min(1.0, avg_diff / abs(avg_spend)))
    else:
        result["spending_trend_3m"] = 0.0

    # Income seasonality: coefficient of variation of monthly income
    monthly_income = raw_features.get("monthly_income", [])
    if isinstance(monthly_income, list) and len(monthly_income) >= 2:
        arr = np.array(monthly_income, dtype=float)
        mean_val = np.mean(arr)
        if mean_val > 0:
            cv = float(np.std(arr) / mean_val)
            result["income_seasonality_index"] = max(0.0, min(1.0, cv))
        else:
            result["income_seasonality_index"] = 0.0
    else:
        result["income_seasonality_index"] = 0.0

    # Transaction velocity change: recent vs. historical transaction rate
    recent_txn = raw_features.get("transaction_count_recent", 0)
    historical_txn = raw_features.get("transaction_count_historical", 0)
    if historical_txn and historical_txn > 0:
        change = (recent_txn - historical_txn) / historical_txn
        result["transaction_velocity_change"] = max(-1.0, min(1.0, change))
    else:
        result["transaction_velocity_change"] = 0.0

    return result


def transform_features(
    raw_features: dict[str, Any],
    include_wallet: bool = None,
    normalize: bool = True,
) -> np.ndarray:
    """Transform raw customer features into an ML-ready feature vector.

    This is the main entry point for the feature pipeline. It:
    1. Extracts core numeric features (with defaults for missing values)
    2. Optionally extracts wallet features (graceful degradation if unavailable)
    3. Computes temporal features from time-series data
    4. One-hot encodes categorical features
    5. Normalizes all numeric values to [0, 1]

    Args:
        raw_features: Dictionary of raw customer features.
        include_wallet: Whether to include wallet features. Defaults to
            WALLET_FEATURES_AVAILABLE module flag.
        normalize: Whether to apply min-max normalization.

    Returns:
        numpy array of transformed features, in the order defined by
        get_feature_names().
    """
    if include_wallet is None:
        include_wallet = WALLET_FEATURES_AVAILABLE

    vector = []

    # 1. Core numeric features
    for feat in CORE_FEATURES:
        val = raw_features.get(feat, 0)
        val = float(val) if val is not None else 0.0
        if normalize and feat in NORMALIZATION_RANGES:
            min_v, max_v = NORMALIZATION_RANGES[feat]
            val = normalize_value(val, min_v, max_v)
        vector.append(val)

    # 2. Wallet features (skip if not available)
    if include_wallet:
        for feat in WALLET_FEATURES:
            val = raw_features.get(feat, 0)
            val = float(val) if val is not None else 0.0
            if normalize and feat in NORMALIZATION_RANGES:
                min_v, max_v = NORMALIZATION_RANGES[feat]
                val = normalize_value(val, min_v, max_v)
            vector.append(val)

    # 3. Temporal features
    temporal = compute_temporal_features(raw_features)
    for feat in TEMPORAL_FEATURES:
        val = temporal.get(feat, 0.0)
        if normalize and feat in NORMALIZATION_RANGES:
            min_v, max_v = NORMALIZATION_RANGES[feat]
            val = normalize_value(val, min_v, max_v)
        vector.append(val)

    # 4. Categorical features (one-hot encoded)
    for feat, categories in CATEGORICAL_FEATURES.items():
        if feat in CORE_FEATURES:
            continue
        encoded = encode_categorical(raw_features, feat, categories)
        for cat in categories:
            col_name = f"{feat}_{cat}"
            vector.append(encoded.get(col_name, 0.0))

    return np.array(vector, dtype=np.float64)


def transform_batch(
    raw_features_list: list[dict[str, Any]],
    include_wallet: bool = None,
    normalize: bool = True,
) -> np.ndarray:
    """Transform a batch of raw features into a 2D feature matrix.

    Args:
        raw_features_list: List of raw feature dictionaries.
        include_wallet: Whether to include wallet features.
        normalize: Whether to apply normalization.

    Returns:
        2D numpy array of shape (n_samples, n_features).
    """
    if not raw_features_list:
        return np.empty((0, len(get_feature_names(include_wallet))))

    rows = [
        transform_features(f, include_wallet=include_wallet, normalize=normalize)
        for f in raw_features_list
    ]
    return np.vstack(rows)
