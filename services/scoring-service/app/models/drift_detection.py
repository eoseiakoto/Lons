"""Feature drift detection using Population Stability Index (PSI).

Monitors distribution drift between training (reference) data and
incoming prediction (current) data. PSI > threshold indicates significant
drift that may require model retraining.
"""

from datetime import datetime
from typing import Optional

import numpy as np

from app.config import settings
from app.schemas.models import DriftReport, FeatureDrift
from app.models.feature_engineering import get_feature_names


def _calculate_psi(reference: np.ndarray, current: np.ndarray, num_bins: int = 10) -> float:
    """Calculate Population Stability Index between two distributions.

    PSI = sum((current_pct - reference_pct) * ln(current_pct / reference_pct))

    Interpretation:
      - PSI < 0.10: No significant drift
      - 0.10 <= PSI < 0.25: Moderate drift, monitor closely
      - PSI >= 0.25: Significant drift, model retraining recommended

    Args:
        reference: 1D array of reference (training) values.
        current: 1D array of current (prediction) values.
        num_bins: Number of bins for histogram comparison.

    Returns:
        PSI value (float, >= 0).
    """
    if len(reference) == 0 or len(current) == 0:
        return 0.0

    # Create bins from reference distribution
    min_val = min(float(np.min(reference)), float(np.min(current)))
    max_val = max(float(np.max(reference)), float(np.max(current)))

    if min_val == max_val:
        return 0.0

    bin_edges = np.linspace(min_val, max_val, num_bins + 1)
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    ref_counts, _ = np.histogram(reference, bins=bin_edges)
    cur_counts, _ = np.histogram(current, bins=bin_edges)

    # Convert to proportions with smoothing to avoid division by zero
    epsilon = 1e-6
    ref_pct = (ref_counts + epsilon) / (len(reference) + epsilon * num_bins)
    cur_pct = (cur_counts + epsilon) / (len(current) + epsilon * num_bins)

    # PSI formula
    psi = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))
    return max(0.0, psi)


def _calculate_kl_divergence(reference: np.ndarray, current: np.ndarray, num_bins: int = 10) -> float:
    """Calculate KL divergence from reference to current distribution.

    KL(P || Q) = sum(P(x) * ln(P(x) / Q(x)))

    Args:
        reference: 1D array of reference values (P).
        current: 1D array of current values (Q).
        num_bins: Number of bins for histogram comparison.

    Returns:
        KL divergence value (float, >= 0).
    """
    if len(reference) == 0 or len(current) == 0:
        return 0.0

    min_val = min(float(np.min(reference)), float(np.min(current)))
    max_val = max(float(np.max(reference)), float(np.max(current)))

    if min_val == max_val:
        return 0.0

    bin_edges = np.linspace(min_val, max_val, num_bins + 1)
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    ref_counts, _ = np.histogram(reference, bins=bin_edges)
    cur_counts, _ = np.histogram(current, bins=bin_edges)

    epsilon = 1e-6
    ref_pct = (ref_counts + epsilon) / (len(reference) + epsilon * num_bins)
    cur_pct = (cur_counts + epsilon) / (len(current) + epsilon * num_bins)

    kl = float(np.sum(ref_pct * np.log(ref_pct / cur_pct)))
    return max(0.0, kl)


def detect_drift(
    reference_data: np.ndarray,
    current_data: np.ndarray,
    model_id: str,
    tenant_id: str,
    feature_names: Optional[list[str]] = None,
    threshold: Optional[float] = None,
    include_wallet: bool = False,
    num_bins: int = 10,
) -> DriftReport:
    """Detect feature drift between reference and current data distributions.

    Calculates per-feature PSI and an overall drift score. Returns a
    structured DriftReport.

    Args:
        reference_data: 2D array of reference (training) feature vectors.
        current_data: 2D array of current (prediction) feature vectors.
        model_id: Model identifier for the report.
        tenant_id: Tenant identifier for the report.
        feature_names: Optional feature names. Defaults to standard names.
        threshold: PSI threshold for drift detection. Defaults to config value.
        include_wallet: Whether wallet features are included.
        num_bins: Number of bins for PSI calculation.

    Returns:
        DriftReport with per-feature and overall drift information.
    """
    if threshold is None:
        threshold = settings.psi_threshold

    if feature_names is None:
        feature_names = get_feature_names(include_wallet=include_wallet)

    n_features = min(reference_data.shape[1] if reference_data.ndim > 1 else 1,
                     current_data.shape[1] if current_data.ndim > 1 else 1)

    feature_drifts = []
    psi_values = []

    for i in range(n_features):
        ref_col = reference_data[:, i] if reference_data.ndim > 1 else reference_data
        cur_col = current_data[:, i] if current_data.ndim > 1 else current_data

        psi = _calculate_psi(ref_col, cur_col, num_bins=num_bins)
        psi_values.append(psi)

        name = feature_names[i] if i < len(feature_names) else f"feature_{i}"
        feature_drifts.append(
            FeatureDrift(
                feature_name=name,
                psi=round(psi, 6),
                drifted=psi >= threshold,
            )
        )

    overall_psi = float(np.mean(psi_values)) if psi_values else 0.0

    return DriftReport(
        model_id=model_id,
        tenant_id=tenant_id,
        overall_psi=round(overall_psi, 6),
        drift_detected=overall_psi >= threshold,
        threshold=threshold,
        feature_drifts=feature_drifts,
        num_reference_samples=len(reference_data),
        num_current_samples=len(current_data),
        generated_at=datetime.utcnow(),
    )
