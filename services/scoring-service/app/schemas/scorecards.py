"""Pydantic schemas for scorecard configuration endpoints."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ScorecardBand(BaseModel):
    """A scoring band within a scorecard factor."""
    min_value: float
    max_value: Optional[float] = None
    points: float


class ScorecardFactor(BaseModel):
    """A factor/feature in a scorecard with its weight and scoring bands."""
    name: str
    weight: float = Field(..., gt=0, description="Weight of this factor (positive number)")
    bands: list[ScorecardBand] = Field(..., min_length=1)
    description: Optional[str] = None


class ScorecardConfig(BaseModel):
    """Full scorecard configuration."""
    scorecard_id: Optional[str] = None
    tenant_id: str
    name: str
    version: int = 1
    factors: list[ScorecardFactor] = Field(..., min_length=1)
    min_score: float = 0
    max_score: float = 1000
    description: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ScorecardCreateRequest(BaseModel):
    """Request to create a new scorecard."""
    tenant_id: str
    name: str
    factors: list[ScorecardFactor] = Field(..., min_length=1)
    min_score: float = 0
    max_score: float = 1000
    description: Optional[str] = None


class ScorecardUpdateRequest(BaseModel):
    """Request to update a scorecard (creates new version)."""
    name: Optional[str] = None
    factors: Optional[list[ScorecardFactor]] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ScorecardListResponse(BaseModel):
    """Response for listing scorecards."""
    scorecards: list[ScorecardConfig]
    total: int
