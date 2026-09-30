# Portal Links — Personal/Public Grouping

> Executable contract for portal link grouping, ownership, and visibility.
> Source of truth: `backend/app/routers/portal.py`, `backend/app/models.py` (PortalLink).

---

## Scenario: Portal link personal/public grouping

### 1. Scope / Trigger

- Trigger: any change to the portal link APIs, the `PortalLink` model, or `PortalPage` UI. This is a cross-layer contract: DB columns → API payloads → frontend types (`frontend/src/services/api.ts`).

### 2. Signatures

- DB (`portal_links`): `scope VARCHAR(20) NOT NULL DEFAULT 'personal'` (`personal` | `public`); `owner_id INTEGER REFERENCES users(id)` (NULL for builtin/legacy rows).
- `GET /api/portal/links` → `list[PortalLinkResponse]` — **authentication required** (401 anonymous).
- `POST /api/portal/links` (admin/editor) — body `PortalLinkCreate`; optional `scope`, default `personal`.
- `PUT /api/portal/links/{id}` (admin/editor) — body `PortalLinkUpdate`; optional `scope`.
- `POST | DELETE /api/portal/links/{id}/background` (admin/editor).
- `DELETE /api/portal/links/{id}` (admin/editor).

### 3. Contracts

- Response adds: `scope` (`"personal"` | `"public"`), `owner_id: int | null`, `owner_name: str | null` (model `@property`: `owner.display_name or owner.username`; NULL without owner).
- Visibility filter (server-side): admin → all links; every other role → `scope='public' OR owner_id=<current_user>`.
- Manage rule (`_assert_can_manage`): admin → any non-builtin link (background-image ops additionally remain allowed on builtin links, as before); editor → only their own `personal` links.
- New links: `owner_id = current_user.id`; editor requests with `scope="public"` are rejected.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| anonymous `GET /api/portal/links` | 401 |
| viewer/guest POST/PUT/DELETE/background | 403 (require_role) |
| editor create or update with `scope="public"` | 403 `Only admin can create public links` |
| editor edits/deletes a public, builtin, or other user's link | 403 `You can only manage your own personal links` |
| edit/delete builtin link (also admin) | 403 `Cannot edit a builtin link` |
| invalid `scope` value | 422 (Pydantic `Literal`) |
| PUT without `scope` field | 200, scope/owner unchanged (never a false 403) |

### 5. Good / Base / Bad Cases

- Good: editor POST without `scope` → response `scope="personal"`, `owner_id=editor.id`, `owner_name` set.
- Base: admin PUT `{"name": "x"}` on another user's link → 200, scope and owner unchanged.
- Bad: a new builtin link inserted by a seed/script without `scope='public'` → ORM default `personal` + `owner_id NULL` makes it invisible to non-admins (and unreachable in any UI group).

### 6. Tests Required

- E2E (pattern: `backend/data/_test_*_e2e.py` with temp `DATABASE_URL`/`UPLOAD_DIR`/`DATA_DIR`): anonymous 401; role visibility matrix; editor create-public 403; editor own-link edit/delete 200; editor public/other/builtin edit 403; admin other-link edit 200; builtin edit/delete 403; `owner_name` serialization (display_name fallback username).
- Migration assertion: legacy rows get `scope='public'` on first upgrade; re-running `migrate_db()` keeps later `personal` rows untouched.

### 7. Wrong vs Correct

#### Wrong

Enforcing grouping/visibility only in the frontend (hiding groups or action buttons) — the API still leaks or mis-authorizes links.

#### Correct

- Filter in `list_portal_links` with `or_(PortalLink.scope == "public", PortalLink.owner_id == current_user.id)`.
- Enforce manage rules centrally via `_assert_can_manage` in every mutating endpoint; frontend button visibility is UX only (mirror `canManageLink` in `PortalPage.tsx`).
