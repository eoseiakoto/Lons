"""Scorecard configuration API endpoints."""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.scorecards import (
    ScorecardConfig,
    ScorecardCreateRequest,
    ScorecardUpdateRequest,
    ScorecardListResponse,
)
from app.models.scorecard_config import (
    create_scorecard,
    get_scorecard,
    update_scorecard,
    list_scorecards,
)

router = APIRouter(prefix="/scorecards", tags=["scorecards"])


@router.get("", response_model=ScorecardListResponse)
async def list_tenant_scorecards(
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """List all scorecards for a tenant."""
    scorecards = list_scorecards(tenant_id)
    return ScorecardListResponse(scorecards=scorecards, total=len(scorecards))


@router.post("", response_model=ScorecardConfig, status_code=201)
async def create_tenant_scorecard(request: ScorecardCreateRequest):
    """Create a new scorecard configuration for a tenant."""
    config = create_scorecard(
        tenant_id=request.tenant_id,
        name=request.name,
        factors=request.factors,
        min_score=request.min_score,
        max_score=request.max_score,
        description=request.description,
    )
    return config


@router.get("/{scorecard_id}", response_model=ScorecardConfig)
async def get_tenant_scorecard(
    scorecard_id: str,
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """Get a specific scorecard by ID."""
    config = get_scorecard(tenant_id, scorecard_id)
    if config is None:
        raise HTTPException(
            status_code=404,
            detail=f"Scorecard {scorecard_id} not found for tenant {tenant_id}",
        )
    return config


@router.put("/{scorecard_id}", response_model=ScorecardConfig)
async def update_tenant_scorecard(
    scorecard_id: str,
    request: ScorecardUpdateRequest,
    tenant_id: str = Query(..., description="Tenant identifier"),
):
    """Update a scorecard configuration.

    Creates a new version with the updated fields.
    Any fields not provided in the request retain their current values.
    """
    config = update_scorecard(
        tenant_id=tenant_id,
        scorecard_id=scorecard_id,
        name=request.name,
        factors=request.factors,
        min_score=request.min_score,
        max_score=request.max_score,
        description=request.description,
        is_active=request.is_active,
    )
    if config is None:
        raise HTTPException(
            status_code=404,
            detail=f"Scorecard {scorecard_id} not found for tenant {tenant_id}",
        )
    return config
