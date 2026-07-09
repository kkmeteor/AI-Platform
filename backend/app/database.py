import sqlite3
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import get_settings

settings = get_settings()
DATABASE_URL = settings.database_url

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_db():
    """Auto-migrate SQLite database to add new columns if they don't exist."""
    db_path = DATABASE_URL.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(skills)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    migrations = [
        ("is_readonly", "BOOLEAN NOT NULL DEFAULT 0"),
        ("is_pinned", "BOOLEAN NOT NULL DEFAULT 0"),
    ]
    for col_name, col_type in migrations:
        if col_name not in existing_columns:
            conn.execute(f"ALTER TABLE skills ADD COLUMN {col_name} {col_type}")
    conn.commit()
    conn.close()


migrate_db()
