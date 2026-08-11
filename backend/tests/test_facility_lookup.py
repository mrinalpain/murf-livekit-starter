import os
import sys

import pytest

# Ensure src is in python path
src_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from agent import Assistant  # noqa: E402
from facility_lookup import (  # noqa: E402
    find_nearby_facilities,
    haversine_distance,
)


def test_haversine_distance():
    """Verify distance calculation between two points (e.g., Bhubaneswar to Cuttack ~19.5 km)."""
    # Bhubaneswar (20.2961, 85.8245), Cuttack (20.4625, 85.8828)
    dist = haversine_distance(20.2961, 85.8245, 20.4625, 85.8828)
    assert 15.0 <= dist <= 30.0


def test_missing_location_returns_location_required():
    """Verify lookup with no location or coordinates requests location from user."""
    res = find_nearby_facilities(location=None, lat=None, lon=None)
    assert res["success"] is False
    assert res.get("location_required") is True
    assert (
        "unavailable" in res.get("message", "").lower()
        or "ask" in res.get("message", "").lower()
    )


def test_failure_simulation_mode():
    """Verify that failure mode (triggered by env var or TRIGGER_FAILURE) returns graceful error."""
    # Test trigger location
    res = find_nearby_facilities(location="TRIGGER_FAILURE")
    assert res["success"] is False
    assert "error" in res
    assert "temporarily unavailable" in res["error"]

    # Test environment variable trigger
    os.environ["DISABLE_FACILITY_API"] = "true"
    try:
        res_env = find_nearby_facilities(location="Bhubaneswar")
        assert res_env["success"] is False
        assert "temporarily unavailable" in res_env.get("error", "")
    finally:
        os.environ.pop("DISABLE_FACILITY_API", None)


def test_real_facility_lookup_bhubaneswar():
    """Verify real facility lookup for a known city returns structured results with retrieved_at timestamp."""
    res = find_nearby_facilities(
        location="Bhubaneswar", facility_type="government hospital", limit=2
    )
    assert res["success"] is True
    assert "retrieved_at" in res
    assert "source" in res
    assert "facilities" in res
    assert isinstance(res["facilities"], list)
    assert len(res["facilities"]) > 0
    first = res["facilities"][0]
    assert "name" in first
    assert "address" in first
    assert "distance_km" in first


def test_real_facility_lookup_coordinates():
    """Verify facility lookup using explicit latitude and longitude coordinates."""
    # Mumbai coordinates
    res = find_nearby_facilities(
        lat=19.0760, lon=72.8777, facility_type="hospital", limit=2
    )
    assert res["success"] is True
    assert "retrieved_at" in res
    assert isinstance(res["facilities"], list)
    assert len(res["facilities"]) > 0


@pytest.mark.asyncio
async def test_assistant_facility_tool_invocation():
    """Verify the assistant tool method executes cleanly and returns structured dict."""
    assistant = Assistant()

    class MockRunContext:
        session = None

    ctx = MockRunContext()
    result = await assistant.find_nearby_healthcare_facility(
        context=ctx,
        location="Delhi",
        facility_type="government hospital",
        limit=2,
    )
    assert isinstance(result, dict)
    assert "success" in result
    if result["success"]:
        assert "facilities" in result
        assert "retrieved_at" in result
