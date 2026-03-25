from pydantic import BaseModel
from typing import Optional


class ScoringRequest(BaseModel):
    customer_id: str
    features: dict
    model_version: Optional[str] = None


class ContributingFactor(BaseModel):
    name: str
    impact: float


class ScoringResponse(BaseModel):
    score: float
    probability_of_default: float
    recommended_limit: str
    confidence: float
    risk_tier: str
    contributing_factors: list[ContributingFactor]
    model_version: str
