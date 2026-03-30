"""Tests for the file-based model registry."""

import os
import tempfile

import pytest

from app.models import model_registry
from app.schemas.models import ModelStatus
from app.config import settings


@pytest.fixture(autouse=True)
def use_temp_storage(tmp_path):
    """Use a temporary directory for model storage during tests."""
    original = settings.model_storage_path
    settings.model_storage_path = str(tmp_path / "models")
    yield
    settings.model_storage_path = original


class TestRegisterModel:
    def test_register_creates_model(self):
        metadata = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1", "f2", "f3"],
            metrics={"auc": 0.85},
            num_training_samples=1000,
            description="Test model",
        )

        assert metadata.model_id is not None
        assert metadata.tenant_id == "tenant-1"
        assert metadata.version == 1
        assert metadata.status == ModelStatus.TRAINING
        assert metadata.feature_list == ["f1", "f2", "f3"]
        assert metadata.metrics == {"auc": 0.85}
        assert metadata.num_training_samples == 1000

    def test_register_increments_version(self):
        m1 = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1"],
            metrics={},
        )
        m2 = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1"],
            metrics={},
        )

        assert m1.version == 1
        assert m2.version == 2

    def test_register_with_feature_importances(self):
        metadata = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1", "f2"],
            metrics={},
            feature_importances=[
                {"feature_name": "f1", "importance": 0.7},
                {"feature_name": "f2", "importance": 0.3},
            ],
        )

        assert len(metadata.feature_importances) == 2
        assert metadata.feature_importances[0].feature_name == "f1"


class TestGetModel:
    def test_get_existing_model(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1"],
            metrics={"auc": 0.9},
        )

        retrieved = model_registry.get_model("tenant-1", registered.model_id)

        assert retrieved is not None
        assert retrieved.model_id == registered.model_id
        assert retrieved.metrics == {"auc": 0.9}

    def test_get_nonexistent_model(self):
        result = model_registry.get_model("tenant-1", "nonexistent-id")
        assert result is None

    def test_get_model_wrong_tenant(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1"],
            metrics={},
        )

        result = model_registry.get_model("tenant-2", registered.model_id)
        assert result is None


class TestListModels:
    def test_list_empty(self):
        result = model_registry.list_models("empty-tenant")
        assert result == []

    def test_list_returns_all_models(self):
        model_registry.register_model(tenant_id="tenant-1", feature_list=[], metrics={})
        model_registry.register_model(tenant_id="tenant-1", feature_list=[], metrics={})
        model_registry.register_model(tenant_id="tenant-1", feature_list=[], metrics={})

        result = model_registry.list_models("tenant-1")
        assert len(result) == 3

    def test_list_sorted_by_version_desc(self):
        model_registry.register_model(tenant_id="tenant-1", feature_list=[], metrics={})
        model_registry.register_model(tenant_id="tenant-1", feature_list=[], metrics={})

        result = model_registry.list_models("tenant-1")
        assert result[0].version > result[1].version

    def test_list_tenant_isolation(self):
        model_registry.register_model(tenant_id="tenant-a", feature_list=[], metrics={})
        model_registry.register_model(tenant_id="tenant-b", feature_list=[], metrics={})

        result_a = model_registry.list_models("tenant-a")
        result_b = model_registry.list_models("tenant-b")

        assert len(result_a) == 1
        assert len(result_b) == 1


class TestActivateModel:
    def test_activate_training_to_active(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1", feature_list=[], metrics={}
        )

        result = model_registry.activate_model(
            "tenant-1", registered.model_id, ModelStatus.ACTIVE
        )

        assert result is not None
        assert result.status == ModelStatus.ACTIVE

    def test_promote_to_champion_demotes_existing(self):
        m1 = model_registry.register_model(
            tenant_id="tenant-1", feature_list=[], metrics={}
        )
        model_registry.activate_model("tenant-1", m1.model_id, ModelStatus.CHAMPION)

        m2 = model_registry.register_model(
            tenant_id="tenant-1", feature_list=[], metrics={}
        )
        model_registry.activate_model("tenant-1", m2.model_id, ModelStatus.CHAMPION)

        # m1 should now be demoted to active
        m1_updated = model_registry.get_model("tenant-1", m1.model_id)
        m2_updated = model_registry.get_model("tenant-1", m2.model_id)

        assert m1_updated.status == ModelStatus.ACTIVE
        assert m2_updated.status == ModelStatus.CHAMPION

    def test_cannot_activate_archived(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1", feature_list=[], metrics={}
        )
        model_registry.archive_model("tenant-1", registered.model_id)

        with pytest.raises(ValueError, match="archived"):
            model_registry.activate_model(
                "tenant-1", registered.model_id, ModelStatus.ACTIVE
            )

    def test_activate_nonexistent_returns_none(self):
        result = model_registry.activate_model(
            "tenant-1", "nonexistent-id", ModelStatus.ACTIVE
        )
        assert result is None

    def test_invalid_target_status_raises(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1", feature_list=[], metrics={}
        )
        with pytest.raises(ValueError):
            model_registry.activate_model(
                "tenant-1", registered.model_id, ModelStatus.TRAINING
            )


class TestArchiveModel:
    def test_archive_model(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1", feature_list=[], metrics={}
        )
        result = model_registry.archive_model("tenant-1", registered.model_id)

        assert result is not None
        assert result.status == ModelStatus.ARCHIVED

    def test_archive_nonexistent_returns_none(self):
        result = model_registry.archive_model("tenant-1", "nonexistent-id")
        assert result is None


class TestFilePersistence:
    def test_data_persists_across_reads(self):
        registered = model_registry.register_model(
            tenant_id="tenant-1",
            feature_list=["f1"],
            metrics={"auc": 0.85},
        )

        # Read it back
        retrieved = model_registry.get_model("tenant-1", registered.model_id)
        assert retrieved is not None
        assert retrieved.feature_list == ["f1"]

    def test_model_path_generation(self):
        path = model_registry.get_model_path("tenant-1", "model-abc")
        assert "tenant-1" in path
        assert "model-abc" in path
        assert path.endswith(".pkl")
