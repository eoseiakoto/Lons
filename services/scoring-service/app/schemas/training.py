"""Pydantic schemas for model training endpoints."""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class DatasetFormat(str, Enum):
    """Supported training data formats."""
    CSV = "csv"
    JSON = "json"


class TrainingRequest(BaseModel):
    """Request to trigger model training."""
    tenant_id: str
    dataset_format: DatasetFormat = DatasetFormat.JSON
    training_data: list[dict] = Field(
        ...,
        description="List of training samples. Each dict has feature columns and a 'target' column (0/1 for default).",
    )
    model_params: dict = Field(
        default_factory=lambda: {
            "n_estimators": 100,
            "max_depth": 6,
            "learning_rate": 0.1,
            "subsample": 0.8,
        },
        description="XGBoost hyperparameters",
    )
    description: Optional[str] = None
    feature_columns: Optional[list[str]] = Field(
        None,
        description="Explicit feature columns. If None, all columns except 'target' are used.",
    )


class TrainingResponse(BaseModel):
    """Response after training completes or is enqueued."""
    model_id: str
    tenant_id: str
    status: str = "completed"
    version: int = 1
    metrics: dict = Field(default_factory=dict)
    num_samples: int = 0
    message: str = "Model training completed successfully"
