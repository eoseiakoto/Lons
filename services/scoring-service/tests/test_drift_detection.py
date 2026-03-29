"""Tests for drift detection using PSI."""

import numpy as np
import pytest

from app.models.drift_detection import _calculate_psi, _calculate_kl_divergence, detect_drift


class TestPSICalculation:
    def test_identical_distributions_low_psi(self):
        np.random.seed(42)
        data = np.random.randn(1000)
        psi = _calculate_psi(data, data)
        assert psi < 0.05  # Should be very low for identical data

    def test_different_distributions_high_psi(self):
        np.random.seed(42)
        ref = np.random.randn(1000)
        cur = np.random.randn(1000) + 3.0  # Shifted distribution
        psi = _calculate_psi(ref, cur)
        assert psi > 0.25  # Should detect significant drift

    def test_psi_is_non_negative(self):
        np.random.seed(42)
        ref = np.random.randn(100)
        cur = np.random.randn(100)
        psi = _calculate_psi(ref, cur)
        assert psi >= 0

    def test_empty_arrays_return_zero(self):
        assert _calculate_psi(np.array([]), np.array([1, 2, 3])) == 0.0
        assert _calculate_psi(np.array([1, 2, 3]), np.array([])) == 0.0

    def test_constant_values_return_zero(self):
        ref = np.ones(100)
        cur = np.ones(100)
        psi = _calculate_psi(ref, cur)
        assert psi == 0.0

    def test_moderate_shift(self):
        np.random.seed(42)
        ref = np.random.randn(1000)
        cur = np.random.randn(1000) + 0.5  # Moderate shift
        psi = _calculate_psi(ref, cur)
        # Should be somewhere in the moderate range
        assert psi > 0.01


class TestKLDivergence:
    def test_identical_distributions_low_kl(self):
        np.random.seed(42)
        data = np.random.randn(1000)
        kl = _calculate_kl_divergence(data, data)
        assert kl < 0.05

    def test_different_distributions_high_kl(self):
        np.random.seed(42)
        ref = np.random.randn(1000)
        cur = np.random.randn(1000) + 3.0
        kl = _calculate_kl_divergence(ref, cur)
        assert kl > 0.1

    def test_kl_is_non_negative(self):
        np.random.seed(42)
        ref = np.random.randn(100)
        cur = np.random.randn(100)
        kl = _calculate_kl_divergence(ref, cur)
        assert kl >= 0


class TestDetectDrift:
    def test_no_drift_detected(self):
        np.random.seed(42)
        data = np.random.randn(200, 5)
        report = detect_drift(
            reference_data=data,
            current_data=data,
            model_id="test-model",
            tenant_id="test-tenant",
            feature_names=["f1", "f2", "f3", "f4", "f5"],
        )

        assert report.model_id == "test-model"
        assert report.tenant_id == "test-tenant"
        assert report.drift_detected is False
        assert len(report.feature_drifts) == 5

    def test_drift_detected_with_shifted_data(self):
        np.random.seed(42)
        ref = np.random.randn(200, 3)
        cur = np.random.randn(200, 3) + 3.0  # Large shift

        report = detect_drift(
            reference_data=ref,
            current_data=cur,
            model_id="test-model",
            tenant_id="test-tenant",
            feature_names=["f1", "f2", "f3"],
            threshold=0.25,
        )

        assert report.drift_detected is True
        assert report.overall_psi > 0.25

    def test_threshold_configurable(self):
        np.random.seed(42)
        ref = np.random.randn(200, 3)
        cur = np.random.randn(200, 3) + 0.5

        # With very high threshold, no drift
        report_high = detect_drift(
            reference_data=ref,
            current_data=cur,
            model_id="m1",
            tenant_id="t1",
            feature_names=["f1", "f2", "f3"],
            threshold=10.0,
        )
        assert report_high.drift_detected is False

    def test_per_feature_drift_info(self):
        np.random.seed(42)
        ref = np.random.randn(200, 3)
        cur = ref.copy()
        cur[:, 0] += 5.0  # Only shift first feature

        report = detect_drift(
            reference_data=ref,
            current_data=cur,
            model_id="m1",
            tenant_id="t1",
            feature_names=["shifted_feature", "stable_1", "stable_2"],
            threshold=0.25,
        )

        # First feature should show drift
        shifted = report.feature_drifts[0]
        assert shifted.feature_name == "shifted_feature"
        assert shifted.psi > 0.25
        assert shifted.drifted is True

    def test_report_contains_sample_counts(self):
        np.random.seed(42)
        ref = np.random.randn(100, 2)
        cur = np.random.randn(50, 2)

        report = detect_drift(
            reference_data=ref,
            current_data=cur,
            model_id="m1",
            tenant_id="t1",
            feature_names=["f1", "f2"],
        )

        assert report.num_reference_samples == 100
        assert report.num_current_samples == 50

    def test_report_has_timestamp(self):
        np.random.seed(42)
        ref = np.random.randn(50, 2)
        cur = np.random.randn(50, 2)

        report = detect_drift(
            reference_data=ref,
            current_data=cur,
            model_id="m1",
            tenant_id="t1",
        )

        assert report.generated_at is not None
