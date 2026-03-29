"""Per-tenant scorecard configuration with JSON file persistence.

Stores scorecard configurations at scorecards/{tenant_id}/ with
versioning support. Updates create new versions rather than overwriting.
"""

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.schemas.scorecards import ScorecardConfig, ScorecardFactor, ScorecardBand

# Module-level lock for thread-safe file I/O
_scorecard_lock = threading.Lock()

# Default storage path (can be overridden)
_storage_base = "scorecards"


def set_storage_path(path: str) -> None:
    """Override the base storage path for scorecards.

    Args:
        path: Directory path for scorecard storage.
    """
    global _storage_base
    _storage_base = path


def _tenant_dir(tenant_id: str) -> Path:
    """Return the directory for a tenant's scorecards."""
    return Path(_storage_base) / tenant_id


def _scorecard_file(tenant_id: str, scorecard_id: str) -> Path:
    """Return the file path for a specific scorecard."""
    return _tenant_dir(tenant_id) / f"{scorecard_id}.json"


def _load_scorecard(tenant_id: str, scorecard_id: str) -> Optional[dict]:
    """Load a scorecard from disk.

    Args:
        tenant_id: Tenant identifier.
        scorecard_id: Scorecard identifier.

    Returns:
        Scorecard data dictionary or None if not found.
    """
    path = _scorecard_file(tenant_id, scorecard_id)
    if not path.exists():
        return None
    with open(path, "r") as f:
        return json.load(f)


def _save_scorecard(tenant_id: str, scorecard_id: str, data: dict) -> None:
    """Save a scorecard to disk.

    Args:
        tenant_id: Tenant identifier.
        scorecard_id: Scorecard identifier.
        data: Scorecard data dictionary.
    """
    directory = _tenant_dir(tenant_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = _scorecard_file(tenant_id, scorecard_id)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def create_scorecard(
    tenant_id: str,
    name: str,
    factors: list[ScorecardFactor],
    min_score: float = 0,
    max_score: float = 1000,
    description: Optional[str] = None,
) -> ScorecardConfig:
    """Create a new scorecard configuration.

    Args:
        tenant_id: Tenant identifier.
        name: Human-readable scorecard name.
        factors: List of scoring factors with weights and bands.
        min_score: Minimum possible score.
        max_score: Maximum possible score.
        description: Optional description.

    Returns:
        The created ScorecardConfig.
    """
    with _scorecard_lock:
        scorecard_id = str(uuid.uuid4())
        now = datetime.utcnow()

        config = ScorecardConfig(
            scorecard_id=scorecard_id,
            tenant_id=tenant_id,
            name=name,
            version=1,
            factors=factors,
            min_score=min_score,
            max_score=max_score,
            description=description,
            is_active=True,
            created_at=now,
            updated_at=now,
        )

        _save_scorecard(tenant_id, scorecard_id, config.model_dump(mode="json"))
        return config


def get_scorecard(tenant_id: str, scorecard_id: str) -> Optional[ScorecardConfig]:
    """Retrieve a scorecard by ID.

    Args:
        tenant_id: Tenant identifier.
        scorecard_id: Scorecard identifier.

    Returns:
        ScorecardConfig or None if not found.
    """
    with _scorecard_lock:
        data = _load_scorecard(tenant_id, scorecard_id)
        if data is None:
            return None
        return ScorecardConfig(**data)


def update_scorecard(
    tenant_id: str,
    scorecard_id: str,
    name: Optional[str] = None,
    factors: Optional[list[ScorecardFactor]] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    description: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Optional[ScorecardConfig]:
    """Update a scorecard, creating a new version.

    Any provided fields override the existing values. The version number
    is incremented automatically.

    Args:
        tenant_id: Tenant identifier.
        scorecard_id: Scorecard identifier.
        name: New name (optional).
        factors: New factors (optional).
        min_score: New minimum score (optional).
        max_score: New maximum score (optional).
        description: New description (optional).
        is_active: New active status (optional).

    Returns:
        Updated ScorecardConfig or None if not found.
    """
    with _scorecard_lock:
        data = _load_scorecard(tenant_id, scorecard_id)
        if data is None:
            return None

        existing = ScorecardConfig(**data)

        updated = ScorecardConfig(
            scorecard_id=scorecard_id,
            tenant_id=tenant_id,
            name=name if name is not None else existing.name,
            version=existing.version + 1,
            factors=factors if factors is not None else existing.factors,
            min_score=min_score if min_score is not None else existing.min_score,
            max_score=max_score if max_score is not None else existing.max_score,
            description=description if description is not None else existing.description,
            is_active=is_active if is_active is not None else existing.is_active,
            created_at=existing.created_at,
            updated_at=datetime.utcnow(),
        )

        _save_scorecard(tenant_id, scorecard_id, updated.model_dump(mode="json"))
        return updated


def list_scorecards(tenant_id: str) -> list[ScorecardConfig]:
    """List all scorecards for a tenant.

    Args:
        tenant_id: Tenant identifier.

    Returns:
        List of ScorecardConfig objects.
    """
    with _scorecard_lock:
        directory = _tenant_dir(tenant_id)
        if not directory.exists():
            return []

        scorecards = []
        for path in directory.glob("*.json"):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                scorecards.append(ScorecardConfig(**data))
            except (json.JSONDecodeError, Exception):
                continue

        scorecards.sort(key=lambda s: s.created_at or datetime.min, reverse=True)
        return scorecards


def delete_scorecard(tenant_id: str, scorecard_id: str) -> bool:
    """Delete a scorecard file.

    Args:
        tenant_id: Tenant identifier.
        scorecard_id: Scorecard identifier.

    Returns:
        True if deleted, False if not found.
    """
    with _scorecard_lock:
        path = _scorecard_file(tenant_id, scorecard_id)
        if path.exists():
            path.unlink()
            return True
        return False
