"""File-based model registry with JSON metadata storage.

Stores ML models as pickle files at models/{tenant_id}/{model_id}.pkl
and metadata in a JSON registry file. All file operations are thread-safe.
"""

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import settings
from app.schemas.models import ModelMetadata, ModelStatus, FeatureImportance

# Module-level lock for thread-safe file I/O
_registry_lock = threading.Lock()


def _registry_path(tenant_id: str) -> Path:
    """Return the path to a tenant's registry JSON file."""
    return Path(settings.model_storage_path) / tenant_id / "registry.json"


def _model_path(tenant_id: str, model_id: str) -> Path:
    """Return the path to a model's pickle file."""
    return Path(settings.model_storage_path) / tenant_id / f"{model_id}.pkl"


def _load_registry(tenant_id: str) -> dict:
    """Load the registry JSON for a tenant.

    Returns:
        Dictionary mapping model_id to metadata dict.
    """
    path = _registry_path(tenant_id)
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return json.load(f)


def _save_registry(tenant_id: str, registry: dict) -> None:
    """Save the registry JSON for a tenant.

    Args:
        tenant_id: Tenant identifier.
        registry: Dictionary mapping model_id to metadata dict.
    """
    path = _registry_path(tenant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(registry, f, indent=2, default=str)


def register_model(
    tenant_id: str,
    feature_list: list[str],
    metrics: dict,
    num_training_samples: int = 0,
    description: Optional[str] = None,
    feature_importances: Optional[list[dict]] = None,
) -> ModelMetadata:
    """Register a new model in the registry.

    Args:
        tenant_id: Tenant identifier.
        feature_list: List of feature names used by the model.
        metrics: Training metrics dictionary.
        num_training_samples: Number of samples used in training.
        description: Optional human-readable description.
        feature_importances: Optional list of feature importance dicts.

    Returns:
        ModelMetadata for the newly registered model.
    """
    with _registry_lock:
        registry = _load_registry(tenant_id)

        model_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Determine version (max existing version + 1)
        existing_versions = [m.get("version", 0) for m in registry.values()]
        version = max(existing_versions, default=0) + 1

        importances = []
        if feature_importances:
            importances = [
                FeatureImportance(feature_name=fi["feature_name"], importance=fi["importance"])
                for fi in feature_importances
            ]

        metadata = ModelMetadata(
            model_id=model_id,
            tenant_id=tenant_id,
            version=version,
            status=ModelStatus.TRAINING,
            training_date=now,
            feature_list=feature_list,
            metrics=metrics,
            feature_importances=importances,
            num_training_samples=num_training_samples,
            description=description,
            created_at=now,
            updated_at=now,
        )

        registry[model_id] = metadata.model_dump(mode="json")
        _save_registry(tenant_id, registry)

        return metadata


def get_model(tenant_id: str, model_id: str) -> Optional[ModelMetadata]:
    """Retrieve model metadata by ID.

    Args:
        tenant_id: Tenant identifier.
        model_id: Model identifier.

    Returns:
        ModelMetadata or None if not found.
    """
    with _registry_lock:
        registry = _load_registry(tenant_id)
        data = registry.get(model_id)
        if data is None:
            return None
        return ModelMetadata(**data)


def list_models(tenant_id: str) -> list[ModelMetadata]:
    """List all models for a tenant.

    Args:
        tenant_id: Tenant identifier.

    Returns:
        List of ModelMetadata, sorted by version descending.
    """
    with _registry_lock:
        registry = _load_registry(tenant_id)
        models = [ModelMetadata(**data) for data in registry.values()]
        models.sort(key=lambda m: m.version, reverse=True)
        return models


def activate_model(tenant_id: str, model_id: str, status: ModelStatus = ModelStatus.ACTIVE) -> Optional[ModelMetadata]:
    """Activate or promote a model (change its status).

    If promoting to CHAMPION, any existing champion is demoted to ACTIVE.
    Only TRAINING, ACTIVE, and CHALLENGER models can be promoted.

    Args:
        tenant_id: Tenant identifier.
        model_id: Model identifier.
        status: Target status (ACTIVE, CHAMPION, or CHALLENGER).

    Returns:
        Updated ModelMetadata or None if model not found.

    Raises:
        ValueError: If the status transition is invalid.
    """
    valid_targets = {ModelStatus.ACTIVE, ModelStatus.CHAMPION, ModelStatus.CHALLENGER}
    if status not in valid_targets:
        raise ValueError(f"Cannot activate model with status {status}. Valid targets: {valid_targets}")

    with _registry_lock:
        registry = _load_registry(tenant_id)
        data = registry.get(model_id)
        if data is None:
            return None

        current_status = ModelStatus(data["status"])
        if current_status == ModelStatus.ARCHIVED:
            raise ValueError("Cannot activate an archived model.")

        # If promoting to champion, demote existing champion
        if status == ModelStatus.CHAMPION:
            for mid, mdata in registry.items():
                if mdata["status"] == ModelStatus.CHAMPION and mid != model_id:
                    mdata["status"] = ModelStatus.ACTIVE
                    mdata["updated_at"] = datetime.utcnow().isoformat()

        data["status"] = status.value
        data["updated_at"] = datetime.utcnow().isoformat()
        registry[model_id] = data
        _save_registry(tenant_id, registry)

        return ModelMetadata(**data)


def archive_model(tenant_id: str, model_id: str) -> Optional[ModelMetadata]:
    """Archive a model (soft delete).

    Args:
        tenant_id: Tenant identifier.
        model_id: Model identifier.

    Returns:
        Updated ModelMetadata or None if not found.
    """
    with _registry_lock:
        registry = _load_registry(tenant_id)
        data = registry.get(model_id)
        if data is None:
            return None

        data["status"] = ModelStatus.ARCHIVED.value
        data["updated_at"] = datetime.utcnow().isoformat()
        registry[model_id] = data
        _save_registry(tenant_id, registry)

        return ModelMetadata(**data)


def update_model_status(tenant_id: str, model_id: str, status: ModelStatus) -> Optional[ModelMetadata]:
    """Update a model's status directly.

    Args:
        tenant_id: Tenant identifier.
        model_id: Model identifier.
        status: New status.

    Returns:
        Updated ModelMetadata or None if not found.
    """
    with _registry_lock:
        registry = _load_registry(tenant_id)
        data = registry.get(model_id)
        if data is None:
            return None

        data["status"] = status.value
        data["updated_at"] = datetime.utcnow().isoformat()
        registry[model_id] = data
        _save_registry(tenant_id, registry)

        return ModelMetadata(**data)


def get_model_path(tenant_id: str, model_id: str) -> str:
    """Return the file path where a model's pickle file should be stored.

    Args:
        tenant_id: Tenant identifier.
        model_id: Model identifier.

    Returns:
        String file path.
    """
    return str(_model_path(tenant_id, model_id))
