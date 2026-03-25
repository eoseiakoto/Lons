"""Mock ML scoring model that implements a rule-based scorecard."""

from typing import Any


SCORECARD_FACTORS = [
    {"name": "account_age_days", "weight": 15, "bands": [(365, None, 100), (180, 364, 70), (90, 179, 40), (0, 89, 10)]},
    {"name": "kyc_level", "weight": 10, "bands": [(3, None, 100), (2, 2, 75), (1, 1, 50), (0, 0, 10)]},
    {"name": "payment_history_pct", "weight": 30, "bands": [(90, None, 100), (70, 89, 70), (50, 69, 40), (0, 49, 10)]},
    {"name": "transaction_frequency", "weight": 15, "bands": [(20, None, 100), (10, 19, 70), (5, 9, 40), (0, 4, 10)]},
    {"name": "existing_debt_ratio", "weight": 15, "bands": [(0, 20, 100), (21, 50, 70), (51, 80, 30), (81, None, 0)]},
    {"name": "income_consistency", "weight": 15, "bands": [(80, None, 100), (60, 79, 70), (40, 59, 40), (0, 39, 10)]},
]

RISK_TIERS = [
    (750, "low"),
    (500, "medium"),
    (300, "high"),
    (0, "critical"),
]

LIMIT_BANDS = [
    (800, 1000, 5.0),
    (600, 799, 3.0),
    (400, 599, 1.5),
    (0, 399, 0.0),
]


def predict(features: dict[str, Any], model_version: str = "v1.0-mock") -> dict:
    total_weighted = 0.0
    total_weight = 0
    contributing_factors = []

    for factor in SCORECARD_FACTORS:
        name = factor["name"]
        weight = factor["weight"]
        value = features.get(name, 0)
        if value is None:
            value = 0
        value = float(value)

        points = 0
        for band_min, band_max, band_points in factor["bands"]:
            max_val = band_max if band_max is not None else float("inf")
            if band_min <= value <= max_val:
                points = band_points
                break

        weighted = points * weight
        total_weighted += weighted
        total_weight += weight
        contributing_factors.append({"name": name, "impact": round(weighted / max(total_weight, 1) / 100, 4)})

    # Normalize to 0-1000
    score = (total_weighted / (total_weight * 100)) * 1000 if total_weight > 0 else 0
    score = round(score, 2)

    # Risk tier
    risk_tier = "critical"
    for min_score, tier in RISK_TIERS:
        if score >= min_score:
            risk_tier = tier
            break

    # PD estimate (simple linear mapping)
    pd = max(0.0, min(1.0, 1.0 - (score / 1000)))
    pd = round(pd, 4)

    # Recommended limit
    base_amount = float(features.get("requested_amount", 1000))
    multiplier = 0.0
    for band_min, band_max, mult in LIMIT_BANDS:
        if band_min <= score <= band_max:
            multiplier = mult
            break
    recommended_limit = round(base_amount * multiplier, 4)

    # Confidence
    confidence = min(total_weight / 100, 1.0)

    # Sort factors by absolute impact
    contributing_factors.sort(key=lambda x: abs(x["impact"]), reverse=True)

    return {
        "score": score,
        "probability_of_default": pd,
        "recommended_limit": str(recommended_limit),
        "confidence": round(confidence, 4),
        "risk_tier": risk_tier,
        "contributing_factors": contributing_factors[:5],
        "model_version": model_version,
    }
