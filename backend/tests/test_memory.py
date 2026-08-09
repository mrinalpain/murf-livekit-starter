import os
import sys
import pytest

# Ensure src is in python path
src_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from db import init_db, get_user_memory, save_user_memory, DB_PATH


@pytest.fixture(autouse=True)
def setup_test_db():
    """Initialize DB and clean up after tests."""
    init_db()
    yield
    # Cleanup database file after test if needed or leave for verification
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except OSError:
            pass


def test_init_db_creates_file():
    """Verify that init_db creates the database file."""
    assert os.path.exists(DB_PATH)


def test_new_user_lookup_returns_none():
    """Verify lookup for non-existent user returns None."""
    result = get_user_memory("caller_non_existent_123")
    assert result is None


def test_save_and_retrieve_user_memory():
    """Verify saving a new user record and retrieving it."""
    user_id = "caller_test_001"
    saved = save_user_memory(
        user_id=user_id,
        name="Ramesh",
        language_preference="Hindi",
        age_band="40-49",
        last_triage_outcome="See doctor soon",
    )
    assert saved is True

    record = get_user_memory(user_id)
    assert record is not None
    assert record["user_id"] == user_id
    assert record["name"] == "Ramesh"
    assert record["language_preference"] == "Hindi"
    assert record["age_band"] == "40-49"
    assert record["last_triage_outcome"] == "See doctor soon"
    assert "last_interaction" in record


def test_upsert_preserves_existing_fields():
    """Verify that updating a single field retains existing saved fields."""
    user_id = "caller_test_002"
    
    # 1. Save name first
    save_user_memory(user_id=user_id, name="Suresh")
    record = get_user_memory(user_id)
    assert record["name"] == "Suresh"
    assert record["language_preference"] is None

    # 2. Update language preference only
    save_user_memory(user_id=user_id, language_preference="Bengali")
    updated = get_user_memory(user_id)
    assert updated["name"] == "Suresh"  # Preserved!
    assert updated["language_preference"] == "Bengali"
