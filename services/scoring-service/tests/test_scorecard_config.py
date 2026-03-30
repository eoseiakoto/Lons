"""Tests for scorecard configuration management."""

import pytest

from app.models.scorecard_config import (
    create_scorecard,
    get_scorecard,
    update_scorecard,
    list_scorecards,
    delete_scorecard,
    set_storage_path,
)
from app.schemas.scorecards import ScorecardFactor, ScorecardBand


@pytest.fixture(autouse=True)
def use_temp_storage(tmp_path):
    """Use a temporary directory for scorecard storage during tests."""
    set_storage_path(str(tmp_path / "scorecards"))
    yield


def _make_factors():
    """Create sample scorecard factors."""
    return [
        ScorecardFactor(
            name="payment_history",
            weight=30,
            bands=[
                ScorecardBand(min_value=90, max_value=None, points=100),
                ScorecardBand(min_value=70, max_value=89, points=70),
                ScorecardBand(min_value=0, max_value=69, points=30),
            ],
        ),
        ScorecardFactor(
            name="account_age",
            weight=20,
            bands=[
                ScorecardBand(min_value=365, max_value=None, points=100),
                ScorecardBand(min_value=180, max_value=364, points=60),
                ScorecardBand(min_value=0, max_value=179, points=20),
            ],
        ),
    ]


class TestCreateScorecard:
    def test_create_returns_config(self):
        config = create_scorecard(
            tenant_id="tenant-1",
            name="Standard Scorecard",
            factors=_make_factors(),
            description="Test scorecard",
        )

        assert config.scorecard_id is not None
        assert config.tenant_id == "tenant-1"
        assert config.name == "Standard Scorecard"
        assert config.version == 1
        assert config.is_active is True
        assert len(config.factors) == 2

    def test_create_with_custom_score_range(self):
        config = create_scorecard(
            tenant_id="tenant-1",
            name="Custom Range",
            factors=_make_factors(),
            min_score=100,
            max_score=900,
        )

        assert config.min_score == 100
        assert config.max_score == 900

    def test_create_multiple_scorecards(self):
        c1 = create_scorecard(tenant_id="tenant-1", name="SC1", factors=_make_factors())
        c2 = create_scorecard(tenant_id="tenant-1", name="SC2", factors=_make_factors())

        assert c1.scorecard_id != c2.scorecard_id


class TestGetScorecard:
    def test_get_existing_scorecard(self):
        created = create_scorecard(
            tenant_id="tenant-1",
            name="Test",
            factors=_make_factors(),
        )

        retrieved = get_scorecard("tenant-1", created.scorecard_id)

        assert retrieved is not None
        assert retrieved.scorecard_id == created.scorecard_id
        assert retrieved.name == "Test"
        assert len(retrieved.factors) == 2

    def test_get_nonexistent_returns_none(self):
        result = get_scorecard("tenant-1", "nonexistent-id")
        assert result is None

    def test_get_wrong_tenant_returns_none(self):
        created = create_scorecard(
            tenant_id="tenant-1",
            name="Test",
            factors=_make_factors(),
        )

        result = get_scorecard("tenant-2", created.scorecard_id)
        assert result is None


class TestUpdateScorecard:
    def test_update_increments_version(self):
        created = create_scorecard(
            tenant_id="tenant-1",
            name="Original",
            factors=_make_factors(),
        )

        updated = update_scorecard(
            tenant_id="tenant-1",
            scorecard_id=created.scorecard_id,
            name="Updated",
        )

        assert updated is not None
        assert updated.version == 2
        assert updated.name == "Updated"

    def test_update_preserves_unchanged_fields(self):
        created = create_scorecard(
            tenant_id="tenant-1",
            name="Original",
            factors=_make_factors(),
            description="Original description",
        )

        updated = update_scorecard(
            tenant_id="tenant-1",
            scorecard_id=created.scorecard_id,
            name="New Name",
        )

        assert updated.name == "New Name"
        assert updated.description == "Original description"
        assert len(updated.factors) == len(created.factors)

    def test_update_factors(self):
        created = create_scorecard(
            tenant_id="tenant-1",
            name="Test",
            factors=_make_factors(),
        )

        new_factors = [
            ScorecardFactor(
                name="single_factor",
                weight=100,
                bands=[ScorecardBand(min_value=0, max_value=None, points=50)],
            )
        ]

        updated = update_scorecard(
            tenant_id="tenant-1",
            scorecard_id=created.scorecard_id,
            factors=new_factors,
        )

        assert len(updated.factors) == 1
        assert updated.factors[0].name == "single_factor"

    def test_update_nonexistent_returns_none(self):
        result = update_scorecard(
            tenant_id="tenant-1",
            scorecard_id="nonexistent",
            name="New",
        )
        assert result is None

    def test_multiple_updates_increment_versions(self):
        created = create_scorecard(
            tenant_id="tenant-1", name="V1", factors=_make_factors()
        )

        v2 = update_scorecard("tenant-1", created.scorecard_id, name="V2")
        v3 = update_scorecard("tenant-1", created.scorecard_id, name="V3")

        assert v2.version == 2
        assert v3.version == 3

    def test_update_active_status(self):
        created = create_scorecard(
            tenant_id="tenant-1", name="Test", factors=_make_factors()
        )
        assert created.is_active is True

        updated = update_scorecard(
            "tenant-1", created.scorecard_id, is_active=False
        )
        assert updated.is_active is False


class TestListScorecards:
    def test_list_empty_tenant(self):
        result = list_scorecards("empty-tenant")
        assert result == []

    def test_list_returns_all(self):
        create_scorecard(tenant_id="tenant-1", name="SC1", factors=_make_factors())
        create_scorecard(tenant_id="tenant-1", name="SC2", factors=_make_factors())

        result = list_scorecards("tenant-1")
        assert len(result) == 2

    def test_list_tenant_isolation(self):
        create_scorecard(tenant_id="tenant-a", name="A", factors=_make_factors())
        create_scorecard(tenant_id="tenant-b", name="B", factors=_make_factors())

        result_a = list_scorecards("tenant-a")
        result_b = list_scorecards("tenant-b")

        assert len(result_a) == 1
        assert len(result_b) == 1
        assert result_a[0].name == "A"
        assert result_b[0].name == "B"


class TestDeleteScorecard:
    def test_delete_existing(self):
        created = create_scorecard(
            tenant_id="tenant-1", name="Test", factors=_make_factors()
        )

        assert delete_scorecard("tenant-1", created.scorecard_id) is True
        assert get_scorecard("tenant-1", created.scorecard_id) is None

    def test_delete_nonexistent(self):
        assert delete_scorecard("tenant-1", "nonexistent") is False
