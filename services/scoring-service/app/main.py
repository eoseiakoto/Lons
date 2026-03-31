from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.score import router as score_router
from app.routers.scorecards import router as scorecards_router
from app.routers.training import router as training_router
from app.routers.models import router as models_router
from app.config import settings

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(score_router)
app.include_router(scorecards_router)
app.include_router(training_router)
app.include_router(models_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": settings.app_name,
        "model_version": settings.model_version,
    }


@app.get("/health/ready")
async def readiness():
    """Readiness probe — confirms the service is ready to handle traffic."""
    return {"status": "ok", "service": "scoring-service", "timestamp": datetime.utcnow().isoformat()}
