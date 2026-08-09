import os
import sqlite3
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger("agent.db")

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
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
        conn.commit()
        conn.close()
        logger.info(f"Database initialized successfully at {DB_PATH}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")


def get_user_memory(user_id: str) -> Optional[Dict[str, Any]]:
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
