from app.models.scoring_model import predict


def test_high_score_inputs():
    result = predict({
        "account_age_days": 500,
        "kyc_level": 3,
        "payment_history_pct": 95,
        "transaction_frequency": 25,
        "existing_debt_ratio": 10,
        "income_consistency": 90,
        "requested_amount": 1000,
    })
    assert result["score"] >= 750
    assert result["risk_tier"] == "low"
    assert float(result["recommended_limit"]) > 0


def test_low_score_inputs():
    result = predict({
        "account_age_days": 10,
        "kyc_level": 0,
        "payment_history_pct": 20,
        "transaction_frequency": 1,
        "existing_debt_ratio": 90,
        "income_consistency": 20,
        "requested_amount": 1000,
    })
    assert result["score"] < 300
    assert result["risk_tier"] == "critical"


def test_missing_features_default_to_zero():
    result = predict({})
    assert result["score"] >= 0
    assert result["risk_tier"] in ["low", "medium", "high", "critical"]


def test_pd_within_bounds():
    result = predict({"account_age_days": 200, "kyc_level": 2})
    assert 0 <= result["probability_of_default"] <= 1


def test_model_version_returned():
    result = predict({}, model_version="v2.0-test")
    assert result["model_version"] == "v2.0-test"
