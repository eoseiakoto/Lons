"""Dual-model scoring: combine rule-based and ML model predictions.

Supports multiple combination strategies and A/B traffic routing
with configurable percentage splits per tenant.
"""

import random
from decimal import Decimal, ROUND_HALF_EVEN
from enum import Enum
from typing import Any, Optional

from app.models.scoring_model import predict as rule_predict
from app.models.ml_model import MLModel


class ScoringStrategy(str, Enum):
    """Strategy for combining rule-based and ML model scores."""
    RULE_ONLY = "rule_only"
    ML_ONLY = "ml_only"
    HIGHER = "higher"
    LOWER = "lower"
    WEIGHTED_AVERAGE = "weighted_average"


# Default A/B routing config: percentage of traffic routed to ML model
# per tenant. 0 = all rule-based, 100 = all ML.
_ab_routing_config: dict[str, int] = {}


def set_ab_routing(tenant_id: str, ml_percentage: int) -> None:
    """Configure A/B traffic routing for a tenant.

    Args:
        tenant_id: Tenant identifier.
        ml_percentage: Percentage of traffic to route to ML model (0-100).

    Raises:
        ValueError: If percentage is out of range.
    """
    if not 0 <= ml_percentage <= 100:
        raise ValueError(f"ml_percentage must be 0-100, got {ml_percentage}")
    _ab_routing_config[tenant_id] = ml_percentage


def get_ab_routing(tenant_id: str) -> int:
    """Get the current A/B routing percentage for a tenant.

    Args:
        tenant_id: Tenant identifier.

    Returns:
        Percentage of traffic routed to ML model (0-100). Default is 0.
    """
    return _ab_routing_config.get(tenant_id, 0)


def should_use_ml(tenant_id: str) -> bool:
    """Determine whether this request should use the ML model based on A/B routing.

    Args:
        tenant_id: Tenant identifier.

    Returns:
        True if this request should use ML, False for rule-based.
    """
    pct = get_ab_routing(tenant_id)
    if pct <= 0:
        return False
    if pct >= 100:
        return True
    return random.randint(1, 100) <= pct


def _combine_scores(
    rule_result: dict,
    ml_result: dict,
    strategy: ScoringStrategy,
    ml_weight: float = 0.6,
) -> dict:
    """Combine rule-based and ML model results according to strategy.

    Args:
        rule_result: Result from rule-based scoring.
        ml_result: Result from ML model scoring.
        strategy: Combination strategy.
        ml_weight: Weight for ML model in weighted_average (0-1).

    Returns:
        Combined scoring result dictionary.
    """
    if strategy == ScoringStrategy.RULE_ONLY:
        return {**rule_result, "scoring_method": "rule_only"}

    if strategy == ScoringStrategy.ML_ONLY:
        return {**ml_result, "scoring_method": "ml_only"}

    if strategy == ScoringStrategy.HIGHER:
        if ml_result["score"] >= rule_result["score"]:
            return {**ml_result, "scoring_method": "higher_ml"}
        return {**rule_result, "scoring_method": "higher_rule"}

    if strategy == ScoringStrategy.LOWER:
        if ml_result["score"] <= rule_result["score"]:
            return {**ml_result, "scoring_method": "lower_ml"}
        return {**rule_result, "scoring_method": "lower_rule"}

    if strategy == ScoringStrategy.WEIGHTED_AVERAGE:
        rule_weight = Decimal(str(1.0 - ml_weight))
        ml_w = Decimal(str(ml_weight))

        combined_score = round(
            float(Decimal(str(rule_result["score"])) * rule_weight +
                  Decimal(str(ml_result["score"])) * ml_w),
            2,
        )

        combined_pd = round(
            float(Decimal(str(rule_result["probability_of_default"])) * rule_weight +
                  Decimal(str(ml_result["probability_of_default"])) * ml_w),
            4,
        )

        # Recommended limit: use weighted average (monetary — use Decimal)
        rule_limit = Decimal(str(rule_result["recommended_limit"]))
        ml_limit = Decimal(str(ml_result["recommended_limit"]))
        combined_limit = (rule_limit * rule_weight + ml_limit * ml_w).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_EVEN
        )

        combined_confidence = round(
            float(Decimal(str(rule_result.get("confidence", 0.5))) * rule_weight +
                  Decimal(str(ml_result.get("confidence", 0.5))) * ml_w),
            4,
        )

        # Risk tier from combined score
        from app.models.ml_model import RISK_TIERS
        risk_tier = "critical"
        for min_score, tier in RISK_TIERS:
            if combined_score >= min_score:
                risk_tier = tier
                break

        # Merge contributing factors from both models
        factors = {}
        for f in rule_result.get("contributing_factors", []):
            factors[f["name"]] = f["impact"] * float(rule_weight)
        for f in ml_result.get("contributing_factors", []):
            name = f["name"]
            factors[name] = factors.get(name, 0) + f["impact"] * float(ml_w)
        combined_factors = [
            {"name": n, "impact": round(v, 4)}
            for n, v in sorted(factors.items(), key=lambda x: abs(x[1]), reverse=True)
        ][:5]

        return {
            "score": combined_score,
            "probability_of_default": combined_pd,
            "recommended_limit": str(combined_limit),
            "confidence": combined_confidence,
            "risk_tier": risk_tier,
            "contributing_factors": combined_factors,
            "scoring_method": "weighted_average",
            "model_version": ml_result.get("model_version", "dual"),
        }

    raise ValueError(f"Unknown scoring strategy: {strategy}")


def dual_score(
    features: dict[str, Any],
    ml_model: Optional[MLModel] = None,
    strategy: ScoringStrategy = ScoringStrategy.RULE_ONLY,
    model_version: str = "v1.0-mock",
    ml_weight: float = 0.6,
    tenant_id: Optional[str] = None,
) -> dict:
    """Execute dual scoring with both rule-based and ML models.

    If A/B routing is configured and strategy is not explicitly set,
    the routing config determines which model to use.

    Args:
        features: Raw customer feature dictionary.
        ml_model: Trained ML model instance. Required for ML strategies.
        strategy: Combination strategy.
        model_version: Version string for rule-based model.
        ml_weight: Weight for ML in weighted_average strategy.
        tenant_id: Tenant ID for A/B routing lookup.

    Returns:
        Scoring result dictionary with additional 'scoring_method' field.

    Raises:
        ValueError: If ML model is required but not provided.
    """
    # A/B routing override
    if tenant_id and strategy == ScoringStrategy.RULE_ONLY:
        if should_use_ml(tenant_id) and ml_model is not None:
            strategy = ScoringStrategy.ML_ONLY

    needs_rule = strategy in {
        ScoringStrategy.RULE_ONLY,
        ScoringStrategy.HIGHER,
        ScoringStrategy.LOWER,
        ScoringStrategy.WEIGHTED_AVERAGE,
    }
    needs_ml = strategy in {
        ScoringStrategy.ML_ONLY,
        ScoringStrategy.HIGHER,
        ScoringStrategy.LOWER,
        ScoringStrategy.WEIGHTED_AVERAGE,
    }

    if needs_ml and ml_model is None:
        raise ValueError(f"ML model is required for strategy '{strategy}' but was not provided.")

    rule_result = None
    ml_result = None

    if needs_rule:
        rule_result = rule_predict(features, model_version)
        rule_result.setdefault("scoring_method", "rule_only")

    if needs_ml:
        ml_result = ml_model.predict(features)
        ml_result["model_version"] = model_version
        ml_result.setdefault("scoring_method", "ml_only")

    if strategy == ScoringStrategy.RULE_ONLY:
        return {**rule_result, "scoring_method": "rule_only"}

    if strategy == ScoringStrategy.ML_ONLY:
        return {**ml_result, "scoring_method": "ml_only"}

    return _combine_scores(rule_result, ml_result, strategy, ml_weight)
