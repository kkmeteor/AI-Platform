# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

All schema changes go through the idempotent `migrate_db()` in `backend/app/database.py`. It runs at import time, *before* `create_all` on startup. Follow the established pattern per table:

```python
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='<table>'")
if cursor.fetchone():
    cursor.execute("PRAGMA table_info(<table>)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    if "new_col" not in existing_columns:
        conn.execute("ALTER TABLE <table> ADD COLUMN new_col <TYPE>")
```

Conventions and gotchas:

- Guard each block with the table-existence check: on a brand-new DB the table does not exist yet and `create_all` builds it directly from the model — keep the model and the migration in sync.
- One-time data backfills (e.g. `UPDATE portal_links SET scope='public'` for legacy rows, see `portal-links.md`) must live **inside** the column-missing branch: it runs exactly once, when the column is first created. Re-running `migrate_db()` must never overwrite rows created after the migration.
- SQLite DDL (`ALTER TABLE`) auto-commits, so the DDL and a following `UPDATE` are not one transaction. A crash between them leaves the column added but the backfill unapplied; a re-run of `migrate_db()` skips the branch (column now exists), so the backfill would never re-run — acceptable for this project, but state the risk explicitly when adding such a migration.
- Application code writing to migrated tables must set NOT NULL columns to meaningful values: any new builtin portal link seed must set `scope='public'`, otherwise the ORM default `personal` + `owner_id NULL` makes it invisible to non-admin users.

---

## Naming Conventions

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

<!-- Database-related mistakes your team has made -->

(To be filled by the team)
