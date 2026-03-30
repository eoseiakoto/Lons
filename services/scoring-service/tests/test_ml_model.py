"""Tests for the XGBoost ML model wrapper."""

import os
import tempfile
from decimal import Decimal

import numpy as np
import pytest

from app.models.ml_model import MLModel
from app.models.feature_engineering import get_feature_names, transform_batch


def _make_training_data(n_samples=200):
    """Generate synthetic training data for tests."""
    np.random.seed(42)
    n_features = len(get_feature_names(include_wallet=False))
    X = np.random.rand(n_samples, n_features)
    # Simple target: default if mean of features < 0.4
    y = (X.mean(axis=1) < 0.4).astype(np.float64)
    # Ensure both classes exist
    y[0] = 0
    y[1] = 1
    return X, y


def _make_feature_dict():
    """Create a sample customer feature dictionary."""
    return {
        "account_age_days": 365,
        "kyc_level": 2,
        "payment_history_pct": 80,
        "transaction_frequency": 15,
        "existing_debt_ratio": 30,
        "income_consistency": 75,
        "requested_amount": 5000,
    }


class TestMLModelTraining:
    def test_train_returns_metrics(self):
        X, y = _make_training_data()
        model = MLModel()
        metrics = model.train(X, y)

        assert "auc" in metrics
        assert "accuracy" in metrics
        assert "precision" in metrics
        assert "recall" in metrics
        assert "num_samples" in metrics
        assert metrics["num_samples"] == len(y)
        assert 0 <= metrics["auc"] <= 1
        assert 0 <= metrics["accuracy"] <= 1

    def test_train_with_custom_params(self):
        X, y = _make_training_data()
        model = MLModel()
        params = {"n_estimators": 50, "max_depth": 3, "learning_rate": 0.05}
        metrics = model.train(X, y, params=params)

        assert metrics["num_samples"] == len(y)
        assert model.params["n_estimators"] == 50
        assert model.params["max_depth"] == 3

    def test_model_is_set_after_training(self):
        X, y = _make_training_data()
        model = MLModel()
        model.train(X, y)
        assert model.model is not None


class TestMLModelPrediction:
    def test_predict_returns_required_fields(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        result = model.predict(_make_feature_dict())

        assert "score" in result
        assert "probability_of_default" in result
        assert "recommended_limit" in result
        assert "confidence" in result
        assert "risk_tier" in result
        assert "contributing_factors" in result

    def test_recommended_limit_is_string(self):
        """Monetary amounts must always be strings, never floats."""
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        result = model.predict(_make_feature_dict())

        assert isinstance(result["recommended_limit"], str)
        # Must be parseable as Decimal
        limit = Decimal(result["recommended_limit"])
        assert limit >= 0

    def test_score_in_valid_range(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        result = model.predict(_make_feature_dict())
        assert 0 <= result["score"] <= 1000

    def test_pd_in_valid_range(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        result = model.predict(_make_feature_dict())
        assert 0 <= result["probability_of_default"] <= 1

    def test_risk_tier_is_valid(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        result = model.predict(_make_feature_dict())
        assert result["risk_tier"] in {"low", "medium", "high", "critical"}

    def test_predict_without_training_raises(self):
        model = MLModel()
        with pytest.raises(RuntimeError, match="not trained"):
            model.predict(_make_feature_dict())

    def test_contributing_factors_limited(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        result = model.predict(_make_feature_dict())
        assert len(result["contributing_factors"]) <= 5


class TestMLModelSerialization:
    def test_save_and_load(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test_model.pkl")
            model.save(path)

            loaded = MLModel()
            loaded.load(path)

            assert loaded.model is not None
            assert loaded.feature_names == model.feature_names
            assert loaded.metrics == model.metrics

    def test_save_creates_directories(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "nested", "deep", "model.pkl")
            model.save(path)
            assert os.path.exists(path)

    def test_load_nonexistent_raises(self):
        model = MLModel()
        with pytest.raises(FileNotFoundError):
            model.load("/nonexistent/path/model.pkl")

    def test_save_without_training_raises(self):
        model = MLModel()
        with pytest.raises(RuntimeError, match="No model"):
            model.save("/tmp/empty.pkl")

    def test_loaded_model_produces_same_predictions(self):
        X, y = _make_training_data()
        model = MLModel()
        model.feature_names = get_feature_names(include_wallet=False)
        model.train(X, y)

        features = _make_feature_dict()
        original_result = model.predict(features)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "model.pkl")
            model.save(path)

            loaded = MLModel()
            loaded.load(path)
            loaded_result = loaded.predict(features)

            assert original_result["score"] == loaded_result["score"]
            assert original_result["recommended_limit"] == loaded_result["recommended_limit"]
