"""Pydantic schemas for model management endpoints."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class ModelStatus(str, Enum):
    """Lifecycle status of an ML model."""
    TRAINING = "training"
    ACTIVE = "active"
    ARCHIVED = "archived"
    CHAMPION = "champion"
    CHALLENGER = "challenger"


class FeatureImportance(BaseModel):
    """A single feature's importance in the model."""
    feature_name: str
    importance: float = Field(..., description="Relative importance score (0-1)")


class ModelMetadata(BaseModel):
    """Full metadata for a registered ML model."""
    model_id: str
    tenant_id: str
    version: int = 1
    status: ModelStatus = ModelStatus.TRAINING
    training_date: Optional[datetime] = None
    feature_list: list[str] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict, description="Training metrics (AUC, accuracy, etc.)")
    feature_importances: list[FeatureImportance] = Field(default_factory=list)
    num_training_samples: int = 0
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ModelListResponse(BaseModel):
    """Response for listing models."""
    models: list[ModelMetadata]
    total: int


class FeatureDrift(BaseModel):
    """Drift information for a single feature."""
    feature_name: str
    psi: float
    drifted: bool


class DriftReport(BaseModel):
    """Drift detection report for a model."""
    model_id: str
    tenant_id: str
    overall_psi: float
    drift_detected: bool
    threshold: float
    feature_drifts: list[FeatureDrift]
    num_reference_samples: int
    num_current_samples: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class ModelActivateRequest(BaseModel):
    """Request to activate/promote a model."""
    status: ModelStatus = ModelStatus.ACTIVE
