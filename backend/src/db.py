import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("agent.db")

DB_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
)
DB_PATH = os.path.join(DB_DIR, "swasthya_sathi.db")


def get_db_connection() -> sqlite3.Connection:
    """Create and return a database connection."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the SQLite database and ensure the users table exists."""
    try:
        os.makedirs(DB_DIR, exist_ok=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                name TEXT,
                language_preference TEXT,
                age_band TEXT,
                last_triage_outcome TEXT,
                last_interaction TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS follow_ups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                phone_number TEXT,
                reason TEXT,
                scheduled_at TEXT,
                status TEXT,
                consent INTEGER,
                created_at TEXT,
                updated_at TEXT
            );
            """
        )
        conn.commit()
        conn.close()
        logger.info(f"Database initialized successfully at {DB_PATH}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")


def get_user_memory(user_id: str) -> Optional[dict[str, Any]]:
    """
    Retrieve stored memory for a given user_id using parameterized queries.
    Returns None if no record exists or if an error occurs.
    """
    if not user_id:
        return None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT user_id, name, language_preference, age_band, last_triage_outcome, last_interaction, created_at, updated_at
            FROM users
            WHERE user_id = ?;
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                "user_id": row["user_id"],
                "name": row["name"],
                "language_preference": row["language_preference"],
                "age_band": row["age_band"],
                "last_triage_outcome": row["last_triage_outcome"],
                "last_interaction": row["last_interaction"],
            }
        return None
    except Exception as e:
        logger.error(f"Memory lookup failed for user_id={user_id}: {e}")
        return None


def save_user_memory(
    user_id: str,
    name: Optional[str] = None,
    language_preference: Optional[str] = None,
    age_band: Optional[str] = None,
    last_triage_outcome: Optional[str] = None,
) -> bool:
    """
    Save or update caller information using an upsert parameterized SQL query.
    Updates last_interaction and updated_at automatically.
    """
    if not user_id:
        return False

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        query = """
        INSERT INTO users (
            user_id, name, language_preference, age_band, last_triage_outcome, last_interaction, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            name = COALESCE(excluded.name, users.name),
            language_preference = COALESCE(excluded.language_preference, users.language_preference),
            age_band = COALESCE(excluded.age_band, users.age_band),
            last_triage_outcome = COALESCE(excluded.last_triage_outcome, users.last_triage_outcome),
            last_interaction = excluded.last_interaction,
            updated_at = excluded.updated_at;
        """

        cursor.execute(
            query,
            (
                user_id,
                name,
                language_preference,
                age_band,
                last_triage_outcome,
                now_iso,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        logger.info(f"Memory saved successfully for user_id={user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to save memory for user_id={user_id}: {e}")
        return False


def create_followup(
    user_id: str,
    phone_number: Optional[str] = None,
    reason: Optional[str] = None,
    scheduled_at: Optional[str] = None,
    consent: bool = True,
) -> Optional[int]:
    """Create a new health follow-up record in SQLite."""
    if not user_id or not consent:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    scheduled_val = scheduled_at or now_iso
    reason_val = reason or "Follow-up after health consultation"

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO follow_ups (
                user_id, phone_number, reason, scheduled_at, status, consent, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                user_id,
                phone_number,
                reason_val,
                scheduled_val,
                "scheduled",
                1 if consent else 0,
                now_iso,
                now_iso,
            ),
        )
        followup_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Created follow-up id={followup_id} for user_id={user_id}")
        return followup_id
    except Exception as e:
        logger.error(f"Failed to create follow-up for user_id={user_id}: {e}")
        return None


def get_followup(followup_id: int) -> Optional[dict[str, Any]]:
    """Retrieve a single follow-up record by ID."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, phone_number, reason, scheduled_at, status, consent, created_at, updated_at FROM follow_ups WHERE id = ?;",
            (followup_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return dict(row)
        return None
    except Exception as e:
        logger.error(f"Failed to fetch follow-up id={followup_id}: {e}")
        return None


def get_pending_followups() -> list[dict[str, Any]]:
    """Retrieve all pending/scheduled follow-ups where consent is granted."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, phone_number, reason, scheduled_at, status, consent, created_at, updated_at FROM follow_ups WHERE status = 'scheduled' AND consent = 1 ORDER BY scheduled_at ASC;"
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Failed to fetch pending follow-ups: {e}")
        return []


def update_followup_status(followup_id: int, status: str) -> bool:
    """Update the status of a follow-up record."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE follow_ups SET status = ?, updated_at = ? WHERE id = ?;",
            (status, now_iso, followup_id),
        )
        conn.commit()
        conn.close()
        logger.info(f"Updated follow-up id={followup_id} status to '{status}'")
        return True
    except Exception as e:
        logger.error(f"Failed to update follow-up id={followup_id} status: {e}")
        return False


def cancel_user_followups(user_id: str) -> bool:
    """Cancel all pending follow-ups for a user (opt-out)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE follow_ups SET status = 'cancelled', consent = 0, updated_at = ? WHERE user_id = ? AND status IN ('scheduled', 'calling');",
            (now_iso, user_id),
        )
        updated_count = cursor.rowcount
        conn.commit()
        conn.close()
        logger.info(f"Cancelled {updated_count} follow-ups for user_id={user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to cancel follow-ups for user_id={user_id}: {e}")
        return False
