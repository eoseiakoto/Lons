"""Tests for the feature engineering pipeline."""

import numpy as np
import pytest

from app.models.feature_engineering import (
    transform_features,
    transform_batch,
    get_feature_names,
    normalize_value,
    compute_temporal_features,
    encode_categorical,
    CORE_FEATURES,
    WALLET_FEATURES,
    TEMPORAL_FEATURES,
    CATEGORICAL_FEATURES,
)


class TestGetFeatureNames:
    def test_core_features_always_included(self):
        names = get_feature_names(include_wallet=False)
        for feat in CORE_FEATURES:
            assert feat in names

    def test_wallet_features_included_when_flag_true(self):
        names = get_feature_names(include_wallet=True)
        for feat in WALLET_FEATURES:
            assert feat in names

    def test_wallet_features_excluded_when_flag_false(self):
        names = get_feature_names(include_wallet=False)
        for feat in WALLET_FEATURES:
            assert feat not in names

    def test_temporal_features_always_included(self):
        names = get_feature_names(include_wallet=False)
        for feat in TEMPORAL_FEATURES:
            assert feat in names


class TestNormalization:
    def test_normalize_midpoint(self):
        assert normalize_value(50, 0, 100) == 0.5

    def test_normalize_clamps_above(self):
        assert normalize_value(150, 0, 100) == 1.0

    def test_normalize_clamps_below(self):
        assert normalize_value(-10, 0, 100) == 0.0

    def test_normalize_equal_range(self):
        assert normalize_value(5, 5, 5) == 0.0


class TestCategoricalEncoding:
    def test_known_category(self):
        result = encode_categorical(
            {"employment_type": "salaried"},
            "employment_type",
            ["salaried", "self_employed", "informal", "unemployed", "unknown"],
        )
        assert result["employment_type_salaried"] == 1.0
        assert result["employment_type_self_employed"] == 0.0

    def test_unknown_category_defaults_to_last(self):
        result = encode_categorical(
            {},
            "employment_type",
            ["salaried", "self_employed", "unknown"],
        )
        assert result["employment_type_unknown"] == 1.0
        assert result["employment_type_salaried"] == 0.0


class TestTemporalFeatures:
    def test_spending_trend_positive(self):
        features = {"monthly_spending": [100, 200, 300]}
        result = compute_temporal_features(features)
        assert result["spending_trend_3m"] > 0

    def test_spending_trend_negative(self):
        features = {"monthly_spending": [300, 200, 100]}
        result = compute_temporal_features(features)
        assert result["spending_trend_3m"] < 0

    def test_missing_temporal_data_returns_zero(self):
        result = compute_temporal_features({})
        assert result["spending_trend_3m"] == 0.0
        assert result["income_seasonality_index"] == 0.0
        assert result["transaction_velocity_change"] == 0.0

    def test_income_seasonality_stable(self):
        features = {"monthly_income": [1000, 1000, 1000, 1000]}
        result = compute_temporal_features(features)
        assert result["income_seasonality_index"] == 0.0

    def test_income_seasonality_variable(self):
        features = {"monthly_income": [500, 1500, 500, 1500]}
        result = compute_temporal_features(features)
        assert result["income_seasonality_index"] > 0

    def test_velocity_change(self):
        features = {"transaction_count_recent": 20, "transaction_count_historical": 10}
        result = compute_temporal_features(features)
        assert result["transaction_velocity_change"] == 1.0  # Clamped to 1.0


class TestTransformFeatures:
    def test_output_is_numpy_array(self):
        result = transform_features({"account_age_days": 365})
        assert isinstance(result, np.ndarray)

    def test_output_length_matches_feature_names(self):
        result = transform_features({}, include_wallet=False)
        expected_len = len(get_feature_names(include_wallet=False))
        assert len(result) == expected_len

    def test_output_length_with_wallet_features(self):
        result = transform_features({}, include_wallet=True)
        expected_len = len(get_feature_names(include_wallet=True))
        assert len(result) == expected_len

    def test_missing_features_default_to_zero(self):
        result = transform_features({}, normalize=False)
        # Core features default to 0
        for i in range(len(CORE_FEATURES)):
            assert result[i] == 0.0

    def test_normalized_values_in_range(self):
        features = {
            "account_age_days": 365,
            "kyc_level": 2,
            "payment_history_pct": 80,
        }
        result = transform_features(features, normalize=True, include_wallet=False)
        for val in result:
            assert 0.0 <= val <= 1.0

    def test_graceful_degradation_without_wallet(self):
        """When wallet features unavailable, pipeline works with core features only."""
        features = {
            "account_age_days": 365,
            "kyc_level": 2,
            "payment_history_pct": 80,
            "wallet_balance_avg_30d": 5000,  # Should be ignored
        }
        result = transform_features(features, include_wallet=False)
        # Should not crash and should have correct length
        expected_len = len(get_feature_names(include_wallet=False))
        assert len(result) == expected_len


class TestTransformBatch:
    def test_batch_shape(self):
        features_list = [
            {"account_age_days": 100},
            {"account_age_days": 200},
            {"account_age_days": 300},
        ]
        result = transform_batch(features_list, include_wallet=False)
        assert result.shape[0] == 3
        expected_cols = len(get_feature_names(include_wallet=False))
        assert result.shape[1] == expected_cols

    def test_empty_batch(self):
        result = transform_batch([], include_wallet=False)
        assert result.shape[0] == 0

    def test_batch_values_match_individual(self):
        features = {"account_age_days": 365, "kyc_level": 2}
        batch_result = transform_batch([features], include_wallet=False)
        single_result = transform_features(features, include_wallet=False)
        np.testing.assert_array_almost_equal(batch_result[0], single_result)
