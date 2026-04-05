"""Tests unitaires — health_scorer.compute()."""

import pytest

from app import health_scorer


def test_no_data_returns_unknown():
    result = health_scorer.compute(None)
    assert result["score"] == 0
    assert result["status"] == "UNKNOWN"
    assert result["indicators"] == {}


def test_empty_dict_returns_unknown():
    result = health_scorer.compute({})
    assert result["status"] == "UNKNOWN"


def test_all_domains_ok():
    data = {
        "dumps_7d": 0,
        "jobs_aborted_7d": 0,
        "wp_priv": 0,
        "wp_stopped": 0,
        "trfc_errors": 0,
        "users_locked": 1,
        "tablespaces": [{"name": "PSAPSR3", "used_pct": 50}],
    }
    result = health_scorer.compute(data)
    assert result["score"] == 100
    assert result["status"] == "OK"
    for domain in ("stability", "performance", "connectivity", "infrastructure", "security"):
        assert result["indicators"][domain]["status"] == "OK"


def test_stability_critical_high_dumps():
    result = health_scorer.compute({"dumps_7d": 10, "jobs_aborted_7d": 0})
    assert result["indicators"]["stability"]["score"] == 20
    assert result["indicators"]["stability"]["status"] == "CRITICAL"
    assert result["status"] == "CRITICAL"


def test_stability_warning():
    result = health_scorer.compute({"dumps_7d": 3, "jobs_aborted_7d": 0})
    assert result["indicators"]["stability"]["score"] == 50
    assert result["indicators"]["stability"]["status"] == "WARNING"


def test_performance_warning_one_wp():
    result = health_scorer.compute({"wp_priv": 1, "wp_stopped": 0})
    assert result["indicators"]["performance"]["score"] == 70
    assert result["indicators"]["performance"]["status"] == "WARNING"


def test_performance_critical_many_wp():
    result = health_scorer.compute({"wp_priv": 3, "wp_stopped": 2})
    assert result["indicators"]["performance"]["score"] == 10
    assert result["indicators"]["performance"]["status"] == "CRITICAL"


def test_connectivity_critical():
    result = health_scorer.compute({"trfc_errors": 25})
    assert result["indicators"]["connectivity"]["score"] == 20
    assert result["indicators"]["connectivity"]["status"] == "CRITICAL"


def test_infrastructure_warning():
    result = health_scorer.compute({
        "tablespaces": [
            {"name": "PSAPSR3", "used_pct": 82},
            {"name": "PSAPTEMP", "used_pct": 40},
        ]
    })
    ind = result["indicators"]["infrastructure"]
    assert ind["score"] == 75
    assert ind["status"] == "WARNING"
    assert "PSAPSR3" in ind["warning"]
    assert ind["critical"] == []


def test_infrastructure_critical():
    result = health_scorer.compute({
        "tablespaces": [{"name": "PSAPSR3", "used_pct": 95}]
    })
    ind = result["indicators"]["infrastructure"]
    assert ind["score"] == 10
    assert "PSAPSR3" in ind["critical"]


def test_security_many_locked_users():
    result = health_scorer.compute({"users_locked": 15})
    assert result["indicators"]["security"]["score"] == 60
    assert result["indicators"]["security"]["status"] == "WARNING"


def test_partial_domains_weighted_correctly():
    # Only stability collected — score should equal stability score
    result = health_scorer.compute({"dumps_7d": 0, "jobs_aborted_7d": 0})
    assert result["score"] == 100
    assert "performance" not in result["indicators"]
    assert "connectivity" not in result["indicators"]


def test_status_thresholds():
    # Score >= 80 → OK
    r = health_scorer.compute({"dumps_7d": 0})
    assert r["status"] == "OK"

    # Score in [50, 79] → WARNING  (3 dumps → score 50)
    r = health_scorer.compute({"dumps_7d": 3})
    assert r["status"] == "WARNING"

    # Score < 50 → CRITICAL  (10 dumps → score 20)
    r = health_scorer.compute({"dumps_7d": 10})
    assert r["status"] == "CRITICAL"
