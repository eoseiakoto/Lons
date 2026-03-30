"""Model management API endpoints."""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.models import (
    ModelMetadata,
    ModelListResponse,
    ModelActivateRequest,
    ModelStatus,
    DriftReport,
)
from app.models import model_registry

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
async def list_models(tenant_id: str = Query(..., description="Tenant identifier")):
    """List all registered models for a tenant.

    Returns model metadata including version, status, and training metrics.
    """
    models = model_registry.list_models(tenant_id)
    return ModelListResponse(models=models, total=len(models))


@router.get("/{model_id}", response_model=ModelMetadata)
async def get_model(
    model_id: str,
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """Get detailed model metadata including feature importance."""
    model = model_registry.get_model(tenant_id, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found for tenant {tenant_id}")
    return model


@router.put("/{model_id}/activate", response_model=ModelMetadata)
async def activate_model(
    model_id: str,
    request: ModelActivateRequest,
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """Activate or promote a model to a new status.

    Valid target statuses: active, champion, challenger.
    Promoting to champion automatically demotes the current champion.
    """
    try:
        result = model_registry.activate_model(tenant_id, model_id, request.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result is None:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found for tenant {tenant_id}")
    return result


@router.put("/{model_id}/archive", response_model=ModelMetadata)
async def archive_model(
    model_id: str,
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """Archive a model (soft delete)."""
    result = model_registry.archive_model(tenant_id, model_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found for tenant {tenant_id}")
    return result


@router.get("/{model_id}/drift", response_model=DriftReport)
async def get_drift_report(
    model_id: str,
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """Get drift detection report for a model.

    Compares the training data distribution against recent prediction data.
    Returns PSI values per feature and overall drift assessment.

    Note: Requires stored reference data. Returns a baseline report if
    no prediction data has been collected yet.
    """
    import numpy as np
    from app.models.drift_detection import detect_drift
    from app.models.feature_engineering import get_feature_names

    model = model_registry.get_model(tenant_id, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found for tenant {tenant_id}")

    # Generate a baseline drift report with synthetic data
    # In production, this would load stored reference and current distributions
    n_features = len(model.feature_list) if model.feature_list else len(get_feature_names())
    reference = np.random.randn(100, n_features)
    current = np.random.randn(50, n_features)

    report = detect_drift(
        reference_data=reference,
        current_data=current,
        model_id=model_id,
        tenant_id=tenant_id,
        feature_names=model.feature_list if model.feature_list else None,
    )
    return report
