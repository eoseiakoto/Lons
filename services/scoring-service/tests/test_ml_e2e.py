"""End-to-end test for the full ML scoring lifecycle.

Tests the complete flow: scorecard creation -> model training -> registry
verification -> scoring with trained model -> dual-model execution ->
drift detection. All monetary amounts are validated as strings.

Uses Starlette's TestClient (bundled with FastAPI) for synchronous ASGI testing.
"""

import uuid

import numpy as np
import pytest

# Skip all tests in this module if xgboost is not available
xgb = pytest.importorskip("xgboost")

from starlette.testclient import TestClient

from app.main import app

TENANT_ID = f"e2e-tenant-{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _generate_training_data(n_samples: int = 200) -> list[dict]:
    """Generate synthetic training data with both target classes."""
    rng = np.random.RandomState(42)
    rows = []
    for _ in range(n_samples):
        target = int(rng.choice([0, 1]))
        offset = -20 if target == 1 else 20
        rows.append({
            "account_age_days": int(rng.randint(30, 1000)),
            "kyc_level": int(rng.choice([0, 1, 2, 3])),
            "payment_history_pct": max(0, min(100, int(rng.normal(70 + offset, 15)))),
            "transaction_frequency": int(rng.randint(1, 50)),
            "existing_debt_ratio": max(0, min(100, int(rng.normal(40 - offset, 20)))),
            "income_consistency": max(0, min(100, int(rng.normal(65 + offset, 15)))),
            "target": target,
        })
    return rows


# ---------------------------------------------------------------------------
# 1. Health Endpoint
# ---------------------------------------------------------------------------

def test_health_endpoint(client: TestClient):
    """Verify the health endpoint returns ok."""
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"


# ---------------------------------------------------------------------------
# 2. Scorecard Configuration
# ---------------------------------------------------------------------------

def test_create_scorecard(client: TestClient):
    """Create a scorecard configuration for the test tenant."""
    payload = {
        "tenant_id": TENANT_ID,
        "name": "E2E Test Scorecard",
        "description": "Scorecard for ML lifecycle E2E test",
        "min_score": 0,
        "max_score": 1000,
        "factors": [
            {
                "name": "payment_history_pct",
                "weight": 30,
                "bands": [
                    {"min_value": 90, "max_value": None, "points": 100},
                    {"min_value": 50, "max_value": 89, "points": 50},
                    {"min_value": 0, "max_value": 49, "points": 10},
                ],
            },
            {
                "name": "income_consistency",
                "weight": 20,
                "bands": [
                    {"min_value": 80, "max_value": None, "points": 100},
                    {"min_value": 40, "max_value": 79, "points": 60},
                    {"min_value": 0, "max_value": 39, "points": 10},
                ],
            },
        ],
    }
    resp = client.post("/scorecards", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tenant_id"] == TENANT_ID
    assert body["name"] == "E2E Test Scorecard"
    assert body["scorecard_id"] is not None
    assert body["version"] >= 1
    assert body["is_active"] is True
    assert len(body["factors"]) == 2


def test_list_scorecards(client: TestClient):
    """Verify the scorecard appears in the tenant listing."""
    resp = client.get("/scorecards", params={"tenant_id": TENANT_ID})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    names = [sc["name"] for sc in body["scorecards"]]
    assert "E2E Test Scorecard" in names


# ---------------------------------------------------------------------------
# 3. Model Training
# ---------------------------------------------------------------------------

def test_train_model(client: TestClient):
    """Train a model with synthetic data and verify completion."""
    training_data = _generate_training_data(200)
    payload = {
        "tenant_id": TENANT_ID,
        "training_data": training_data,
        "description": "E2E test model",
        "model_params": {
            "n_estimators": 50,
            "max_depth": 4,
            "learning_rate": 0.1,
            "subsample": 0.8,
        },
    }
    resp = client.post("/train", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert body["tenant_id"] == TENANT_ID
    assert body["model_id"] is not None
    assert body["num_samples"] == 200
    assert "auc" in body["metrics"]
    assert "accuracy" in body["metrics"]
    assert body["metrics"]["auc"] > 0
    assert body["version"] >= 1


# ---------------------------------------------------------------------------
# 4. Model Registry Verification
# ---------------------------------------------------------------------------

def test_model_in_registry(client: TestClient):
    """Verify the trained model appears in the registry with status active."""
    resp = client.get("/models", params={"tenant_id": TENANT_ID})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1

    models = body["models"]
    active_models = [m for m in models if m["status"] == "active"]
    assert len(active_models) >= 1, (
        f"Expected at least one active model, got statuses: {[m['status'] for m in models]}"
    )

    model = active_models[0]
    assert model["tenant_id"] == TENANT_ID
    assert model["num_training_samples"] == 200
    assert len(model["feature_list"]) > 0


def test_model_detail(client: TestClient):
    """Retrieve model detail and verify metadata structure."""
    resp = client.get("/models", params={"tenant_id": TENANT_ID})
    models = resp.json()["models"]
    model_id = models[0]["model_id"]

    resp = client.get(f"/models/{model_id}", params={"tenant_id": TENANT_ID})
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["model_id"] == model_id
    assert detail["tenant_id"] == TENANT_ID
    assert "training_date" in detail
    assert "created_at" in detail
    assert "updated_at" in detail
    assert isinstance(detail["feature_list"], list)


# ---------------------------------------------------------------------------
# 5. Score with Trained ML Model
# ---------------------------------------------------------------------------

def test_score_with_ml_model(client: TestClient):
    """Score a customer using the trained ML model."""
    payload = {
        "customer_id": "cust-e2e-001",
        "tenant_id": TENANT_ID,
        "scoring_strategy": "ml_only",
        "features": {
            "account_age_days": 500,
            "kyc_level": 3,
            "payment_history_pct": 85,
            "transaction_frequency": 25,
            "existing_debt_ratio": 20,
            "income_consistency": 75,
            "requested_amount": "5000",
        },
    }
    resp = client.post("/score", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "score" in body
    assert "probability_of_default" in body
    assert "recommended_limit" in body
    assert "confidence" in body
    assert "risk_tier" in body
    assert "contributing_factors" in body
    assert "model_version" in body
    assert body.get("scoring_method") == "ml_only"

    # recommended_limit must be a string (monetary value)
    assert isinstance(body["recommended_limit"], str), (
        f"recommended_limit should be a string, got {type(body['recommended_limit'])}"
    )

    assert 0 <= body["score"] <= 1000
    assert 0 <= body["probability_of_default"] <= 1
    assert body["risk_tier"] in ("low", "medium", "high", "critical")


# ---------------------------------------------------------------------------
# 6. Dual-Model Execution (Rule + ML)
# ---------------------------------------------------------------------------

def test_dual_model_rule_only(client: TestClient):
    """Score with rule_only strategy: ML model should not be invoked."""
    payload = {
        "customer_id": "cust-e2e-002",
        "tenant_id": TENANT_ID,
        "scoring_strategy": "rule_only",
        "features": {
            "account_age_days": 400,
            "kyc_level": 2,
            "payment_history_pct": 90,
            "transaction_frequency": 15,
            "existing_debt_ratio": 30,
            "income_consistency": 80,
            "requested_amount": "3000",
        },
    }
    resp = client.post("/score", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["scoring_method"] == "rule_only"
    assert isinstance(body["recommended_limit"], str)


def test_dual_model_higher(client: TestClient):
    """Score with 'higher' strategy: picks the higher of rule vs ML."""
    payload = {
        "customer_id": "cust-e2e-003",
        "tenant_id": TENANT_ID,
        "scoring_strategy": "higher",
        "features": {
            "account_age_days": 600,
            "kyc_level": 3,
            "payment_history_pct": 95,
            "transaction_frequency": 30,
            "existing_debt_ratio": 10,
            "income_consistency": 90,
            "requested_amount": "10000",
        },
    }
    resp = client.post("/score", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["scoring_method"] in ("higher_ml", "higher_rule")
    assert isinstance(body["recommended_limit"], str)


def test_dual_model_lower(client: TestClient):
    """Score with 'lower' strategy: picks the lower of rule vs ML."""
    payload = {
        "customer_id": "cust-e2e-004",
        "tenant_id": TENANT_ID,
        "scoring_strategy": "lower",
        "features": {
            "account_age_days": 200,
            "kyc_level": 1,
            "payment_history_pct": 60,
            "transaction_frequency": 8,
            "existing_debt_ratio": 55,
            "income_consistency": 50,
            "requested_amount": "2000",
        },
    }
    resp = client.post("/score", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["scoring_method"] in ("lower_ml", "lower_rule")
    assert isinstance(body["recommended_limit"], str)


def test_dual_model_weighted_average(client: TestClient):
    """Score with 'weighted_average' strategy: blends rule and ML."""
    payload = {
        "customer_id": "cust-e2e-005",
        "tenant_id": TENANT_ID,
        "scoring_strategy": "weighted_average",
        "features": {
            "account_age_days": 365,
            "kyc_level": 2,
            "payment_history_pct": 75,
            "transaction_frequency": 12,
            "existing_debt_ratio": 40,
            "income_consistency": 65,
            "requested_amount": "4000",
        },
    }
    resp = client.post("/score", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["scoring_method"] == "weighted_average"
    assert isinstance(body["recommended_limit"], str)
    assert 0 <= body["score"] <= 1000


# ---------------------------------------------------------------------------
# 7. Model Metadata After Scoring
# ---------------------------------------------------------------------------

def test_model_metadata_after_scoring(client: TestClient):
    """Verify model metadata still correct after multiple scoring requests."""
    resp = client.get("/models", params={"tenant_id": TENANT_ID})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    model = body["models"][0]
    assert model["status"] in ("active", "champion")
    assert model["num_training_samples"] == 200


def test_promote_model_to_champion(client: TestClient):
    """Promote a model to champion status and verify."""
    resp = client.get("/models", params={"tenant_id": TENANT_ID})
    model_id = resp.json()["models"][0]["model_id"]

    resp = client.put(
        f"/models/{model_id}/activate",
        params={"tenant_id": TENANT_ID},
        json={"status": "champion"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "champion"
    assert body["model_id"] == model_id


# ---------------------------------------------------------------------------
# 8. Drift Detection Report
# ---------------------------------------------------------------------------

def test_drift_detection_report(client: TestClient):
    """Verify drift detection report structure for a trained model."""
    resp = client.get("/models", params={"tenant_id": TENANT_ID})
    model_id = resp.json()["models"][0]["model_id"]

    resp = client.get(
        f"/models/{model_id}/drift",
        params={"tenant_id": TENANT_ID},
    )
    assert resp.status_code == 200
    report = resp.json()

    assert report["model_id"] == model_id
    assert report["tenant_id"] == TENANT_ID
    assert "overall_psi" in report
    assert isinstance(report["overall_psi"], (int, float))
    assert "drift_detected" in report
    assert isinstance(report["drift_detected"], bool)
    assert "threshold" in report
    assert isinstance(report["threshold"], (int, float))
    assert "feature_drifts" in report
    assert isinstance(report["feature_drifts"], list)
    assert "num_reference_samples" in report
    assert "num_current_samples" in report
    assert "generated_at" in report

    if report["feature_drifts"]:
        fd = report["feature_drifts"][0]
        assert "feature_name" in fd
        assert "psi" in fd
        assert "drifted" in fd
        assert isinstance(fd["drifted"], bool)


# ---------------------------------------------------------------------------
# 9. Monetary Amount String Validation (cross-cutting)
# ---------------------------------------------------------------------------

def test_all_monetary_amounts_are_strings(client: TestClient):
    """Verify that recommended_limit is always a string across strategies."""
    strategies = ["rule_only", "ml_only", "higher", "lower", "weighted_average"]
    for strategy in strategies:
        payload = {
            "customer_id": f"cust-money-check-{strategy}",
            "tenant_id": TENANT_ID,
            "scoring_strategy": strategy,
            "features": {
                "account_age_days": 300,
                "kyc_level": 2,
                "payment_history_pct": 70,
                "transaction_frequency": 10,
                "existing_debt_ratio": 35,
                "income_consistency": 60,
                "requested_amount": "5000",
            },
        }
        resp = client.post("/score", json=payload)
        assert resp.status_code == 200, f"Strategy {strategy} failed: {resp.text}"
        body = resp.json()
        assert isinstance(body["recommended_limit"], str), (
            f"Strategy {strategy}: recommended_limit should be string, got {type(body['recommended_limit'])}"
        )


# ---------------------------------------------------------------------------
# 10. Tenant Isolation
# ---------------------------------------------------------------------------

def test_tenant_isolation(client: TestClient):
    """Models from one tenant should not be visible to another."""
    other_tenant = f"other-tenant-{uuid.uuid4().hex[:8]}"
    resp = client.get("/models", params={"tenant_id": other_tenant})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["models"] == []
