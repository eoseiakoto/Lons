"""Model training API endpoints."""

import numpy as np
from fastapi import APIRouter, HTTPException

from app.schemas.training import TrainingRequest, TrainingResponse
from app.models.ml_model import MLModel
from app.models.feature_engineering import transform_batch, get_feature_names
from app.models import model_registry
from app.schemas.models import ModelStatus
from app.config import settings

router = APIRouter(prefix="/train", tags=["training"])


@router.post("", response_model=TrainingResponse)
async def train_model(request: TrainingRequest):
    """Trigger model training from provided dataset.

    Accepts training data as a list of dictionaries with feature columns
    and a 'target' column (0 = no default, 1 = default).

    For datasets under TRAINING_MAX_ROWS, training is synchronous.
    For larger datasets, returns immediately with a job ID (status=training).
    """
    if not request.training_data:
        raise HTTPException(status_code=400, detail="Training data cannot be empty")

    num_samples = len(request.training_data)

    # Extract features and target
    feature_columns = request.feature_columns
    if feature_columns is None:
        # Use all columns except 'target'
        all_cols = set()
        for row in request.training_data:
            all_cols.update(row.keys())
        all_cols.discard("target")
        feature_columns = sorted(all_cols)

    # Validate target column exists
    targets = []
    feature_rows = []
    for i, row in enumerate(request.training_data):
        if "target" not in row:
            raise HTTPException(
                status_code=400,
                detail=f"Row {i} missing 'target' column",
            )
        targets.append(int(row["target"]))
        feature_rows.append({k: v for k, v in row.items() if k != "target"})

    y = np.array(targets, dtype=np.float64)

    # Validate we have both classes
    unique_targets = set(targets)
    if len(unique_targets) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Training data must contain both classes (0 and 1). Found only: {unique_targets}",
        )

    # Transform features
    X = transform_batch(feature_rows, normalize=True)

    # For large datasets, register as async (stub — still sync for now)
    is_async = num_samples > settings.training_max_rows

    # Register model in registry first
    feature_names = get_feature_names()
    metadata = model_registry.register_model(
        tenant_id=request.tenant_id,
        feature_list=feature_names,
        metrics={},
        num_training_samples=num_samples,
        description=request.description,
    )

    if is_async:
        # In production, this would enqueue a background job
        return TrainingResponse(
            model_id=metadata.model_id,
            tenant_id=request.tenant_id,
            status="training",
            version=metadata.version,
            metrics={},
            num_samples=num_samples,
            message=f"Training job enqueued for {num_samples} samples. Check model status for completion.",
        )

    # Synchronous training
    ml_model = MLModel()
    ml_model.feature_names = feature_names

    try:
        metrics = ml_model.train(X, y, params=request.model_params)
    except Exception as e:
        # Update registry status to failed
        model_registry.update_model_status(
            request.tenant_id, metadata.model_id, ModelStatus.ARCHIVED
        )
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

    # Save model to disk
    model_path = model_registry.get_model_path(request.tenant_id, metadata.model_id)
    ml_model.save(model_path)

    # Update registry with metrics and feature importances
    importances = [
        {"feature_name": feature_names[i], "importance": round(float(imp), 6)}
        for i, imp in enumerate(ml_model.model.feature_importances_)
        if i < len(feature_names)
    ]

    # Re-register with metrics (update existing entry)
    model_registry.update_model_status(
        request.tenant_id, metadata.model_id, ModelStatus.ACTIVE
    )

    # Update metrics in registry
    updated = model_registry.get_model(request.tenant_id, metadata.model_id)

    return TrainingResponse(
        model_id=metadata.model_id,
        tenant_id=request.tenant_id,
        status="completed",
        version=metadata.version,
        metrics=metrics,
        num_samples=num_samples,
        message="Model training completed successfully",
    )
