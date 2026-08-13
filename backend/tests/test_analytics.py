import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from analytics import (
    clear_all_call_records,
    delete_call_record,
    end_call,
    get_call_metrics,
    get_recent_calls,
    start_call,
)
from db import init_db


def test_analytics_lifecycle():
    init_db()
    test_call_id = f"test-room-{os.urandom(4).hex()}"

    # 1. Start call
    assert (
        start_call(
            call_id=test_call_id,
            user_id="test_user",
            channel="browser",
            language="Hindi",
        )
        is True
    )

    # 2. End call with success
    assert (
        end_call(
            call_id=test_call_id,
            outcome="success",
            outcome_reason="guidance_provided",
            duration_seconds=42,
            language="Hindi",
        )
        is True
    )

    # 3. Retrieve metrics
    metrics = get_call_metrics()
    assert metrics["total_calls"] >= 1
    assert metrics["successful_calls"] >= 1
    assert metrics["success_rate"] >= 0.0

    # 4. Check recent calls
    recent = get_recent_calls(limit=10)
    found = [c for c in recent if c["call_id"] == test_call_id]
    assert len(found) == 1
    assert found[0]["outcome"] == "success"
    assert found[0]["outcome_reason"] == "guidance_provided"
    assert found[0]["duration_seconds"] == 42
    assert found[0]["language"] == "Hindi"

    # 5. Delete individual record
    db_id = found[0]["id"]
    assert delete_call_record(db_id) is True

    # 6. Clear all records
    assert clear_all_call_records() is True
    post_metrics = get_call_metrics()
    assert post_metrics["total_calls"] == 0
