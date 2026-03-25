from fastapi import APIRouter

from app.schemas.scoring import ScoringRequest, ScoringResponse, ContributingFactor
from app.models.scoring_model import predict
from app.config import settings

router = APIRouter()


@router.post("/score", response_model=ScoringResponse)
async def score_customer(request: ScoringRequest):
    model_version = request.model_version or settings.model_version
    result = predict(request.features, model_version)

    return ScoringResponse(
        score=result["score"],
        probability_of_default=result["probability_of_default"],
        recommended_limit=result["recommended_limit"],
        confidence=result["confidence"],
        risk_tier=result["risk_tier"],
        contributing_factors=[
            ContributingFactor(name=f["name"], impact=f["impact"])
            for f in result["contributing_factors"]
        ],
        model_version=result["model_version"],
    )
