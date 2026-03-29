"""Tests for dual-model scoring strategies."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.models.dual_scoring import (
    ScoringStrategy,
    dual_score,
    set_ab_routing,
    get_ab_routing,
    should_use_ml,
    _combine_scores,
)
from app.models.ml_model import MLModel
from app.models.feature_engineering import get_feature_names


def _make_mock_ml_model(score=700, pd=0.3, limit="3500.0000"):
    """Create a mock ML model that returns deterministic results."""
    model = MagicMock(spec=MLModel)
    model.predict.return_value = {
        "score": score,
        "probability_of_default": pd,
        "recommended_limit": limit,
        "confidence": 0.8,
        "risk_tier": "low" if score >= 750 else "medium",
        "contributing_factors": [
            {"name": "payment_history_pct", "impact": 0.35},
            {"name": "income_consistency", "impact": 0.25},
        ],
    }
    return model


def _make_features():
    return {
        "account_age_days": 365,
        "kyc_level": 2,
        "payment_history_pct": 80,
        "transaction_frequency": 15,
        "existing_debt_ratio": 30,
        "income_consistency": 75,
        "requested_amount": 1000,
    }


class TestRuleOnlyStrategy:
    def test_returns_rule_based_result(self):
        result = dual_score(
            features=_make_features(),
            strategy=ScoringStrategy.RULE_ONLY,
        )
        assert result["scoring_method"] == "rule_only"
        assert "score" in result
        assert "recommended_limit" in result

    def test_does_not_require_ml_model(self):
        result = dual_score(
            features=_make_features(),
            ml_model=None,
            strategy=ScoringStrategy.RULE_ONLY,
        )
        assert result["scoring_method"] == "rule_only"


class TestMLOnlyStrategy:
    def test_returns_ml_result(self):
        ml_model = _make_mock_ml_model(score=750)
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.ML_ONLY,
        )
        assert result["scoring_method"] == "ml_only"
        assert result["score"] == 750

    def test_raises_without_ml_model(self):
        with pytest.raises(ValueError, match="ML model is required"):
            dual_score(
                features=_make_features(),
                ml_model=None,
                strategy=ScoringStrategy.ML_ONLY,
            )


class TestHigherStrategy:
    def test_picks_higher_score(self):
        # ML model returns higher score
        ml_model = _make_mock_ml_model(score=900)
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.HIGHER,
        )
        # Rule-based score for these features is typically < 900
        assert result["score"] == 900
        assert "higher" in result["scoring_method"]

    def test_picks_rule_when_higher(self):
        ml_model = _make_mock_ml_model(score=100)
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.HIGHER,
        )
        # Rule-based should be higher than 100 for decent features
        assert result["score"] > 100
        assert "higher" in result["scoring_method"]


class TestLowerStrategy:
    def test_picks_lower_score(self):
        ml_model = _make_mock_ml_model(score=100)
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.LOWER,
        )
        assert result["score"] == 100
        assert "lower" in result["scoring_method"]

    def test_picks_rule_when_lower(self):
        ml_model = _make_mock_ml_model(score=999)
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.LOWER,
        )
        # Rule-based should be lower than 999
        assert result["score"] < 999
        assert "lower" in result["scoring_method"]


class TestWeightedAverageStrategy:
    def test_weighted_average_combines_scores(self):
        ml_model = _make_mock_ml_model(score=800, pd=0.2, limit="4000.0000")
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.WEIGHTED_AVERAGE,
            ml_weight=0.5,
        )
        assert result["scoring_method"] == "weighted_average"
        assert isinstance(result["score"], float)
        assert isinstance(result["recommended_limit"], str)
        # Ensure it's a valid Decimal string
        Decimal(result["recommended_limit"])

    def test_monetary_amounts_are_strings(self):
        ml_model = _make_mock_ml_model(score=700, limit="3500.0000")
        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.WEIGHTED_AVERAGE,
        )
        assert isinstance(result["recommended_limit"], str)
        # Must parse as Decimal
        limit = Decimal(result["recommended_limit"])
        assert limit >= 0


class TestABRouting:
    def test_default_routing_is_zero(self):
        assert get_ab_routing("new-tenant") == 0

    def test_set_routing(self):
        set_ab_routing("tenant-x", 50)
        assert get_ab_routing("tenant-x") == 50

    def test_invalid_percentage_raises(self):
        with pytest.raises(ValueError):
            set_ab_routing("tenant-x", 101)
        with pytest.raises(ValueError):
            set_ab_routing("tenant-x", -1)

    def test_zero_percent_never_uses_ml(self):
        set_ab_routing("tenant-zero", 0)
        for _ in range(100):
            assert should_use_ml("tenant-zero") is False

    def test_hundred_percent_always_uses_ml(self):
        set_ab_routing("tenant-full", 100)
        for _ in range(100):
            assert should_use_ml("tenant-full") is True

    def test_ab_routing_overrides_rule_only_strategy(self):
        set_ab_routing("tenant-ab", 100)
        ml_model = _make_mock_ml_model(score=750)

        result = dual_score(
            features=_make_features(),
            ml_model=ml_model,
            strategy=ScoringStrategy.RULE_ONLY,
            tenant_id="tenant-ab",
        )
        # Should be overridden to ML
        assert result["scoring_method"] == "ml_only"


class TestCombineScores:
    def test_rule_only_passes_through(self):
        rule = {"score": 500, "probability_of_default": 0.5, "recommended_limit": "1000.0000",
                "confidence": 0.7, "risk_tier": "medium", "contributing_factors": []}
        ml = {"score": 700, "probability_of_default": 0.3, "recommended_limit": "3000.0000",
              "confidence": 0.8, "risk_tier": "low", "contributing_factors": []}

        result = _combine_scores(rule, ml, ScoringStrategy.RULE_ONLY)
        assert result["score"] == 500

    def test_ml_only_passes_through(self):
        rule = {"score": 500, "probability_of_default": 0.5, "recommended_limit": "1000.0000",
                "confidence": 0.7, "risk_tier": "medium", "contributing_factors": []}
        ml = {"score": 700, "probability_of_default": 0.3, "recommended_limit": "3000.0000",
              "confidence": 0.8, "risk_tier": "low", "contributing_factors": []}

        result = _combine_scores(rule, ml, ScoringStrategy.ML_ONLY)
        assert result["score"] == 700
