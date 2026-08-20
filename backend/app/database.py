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

    # --- skills table migrations ---
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skills'"
    )
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(skills)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        skill_migrations = [
            ("is_readonly", "BOOLEAN NOT NULL DEFAULT 0"),
            ("is_pinned", "BOOLEAN NOT NULL DEFAULT 0"),
        ]
        for col_name, col_type in skill_migrations:
            if col_name not in existing_columns:
                conn.execute(f"ALTER TABLE skills ADD COLUMN {col_name} {col_type}")

    # --- mcp_servers table creation & migration ---
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_servers'"
    )
    if not cursor.fetchone():
        conn.execute("""
            CREATE TABLE mcp_servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                url VARCHAR(500) NOT NULL,
                transport VARCHAR(50) DEFAULT 'streamable_http',
                headers TEXT DEFAULT '{}',
                command VARCHAR(500),
                args TEXT,
                env TEXT,
                timeout INTEGER DEFAULT 60,
                sse_read_timeout INTEGER DEFAULT 50,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        cursor.execute("PRAGMA table_info(mcp_servers)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        mcp_migrations = [
            ("command", "VARCHAR(500)"),
            ("args", "TEXT"),
            ("env", "TEXT"),
        ]
        for col_name, col_type in mcp_migrations:
            if col_name not in existing_columns:
                conn.execute(f"ALTER TABLE mcp_servers ADD COLUMN {col_name} {col_type}")
    # --- users table creation ---
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    )
    if not cursor.fetchone():
        conn.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(200),
                display_name VARCHAR(100),
                email VARCHAR(200),
                role VARCHAR(20) NOT NULL DEFAULT 'viewer',
                is_active BOOLEAN NOT NULL DEFAULT 1,
                last_login_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX ix_users_username ON users (username)")
    else:
        cursor.execute("PRAGMA table_info(users)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        user_migrations = [
            ("password", "VARCHAR(200)"),
        ]
        for col_name, col_type in user_migrations:
            if col_name not in existing_columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")

    # --- login_logs table creation ---
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='login_logs'"
    )
    if not cursor.fetchone():
        conn.execute("""
            CREATE TABLE login_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username VARCHAR(50) NOT NULL,
                login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address VARCHAR(50),
                success BOOLEAN NOT NULL DEFAULT 1,
                message VARCHAR(200),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

    conn.commit()
    conn.close()


migrate_db()
