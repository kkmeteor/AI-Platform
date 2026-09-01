# Error Handling

> How errors are handled in this project.

---

## Overview

<!--
Document your project's error handling conventions here.

Questions to answer:
- What error types do you define?
- How are errors propagated?
- How are errors logged?
- How are errors returned to clients?
-->

(To be filled by the team)

---

## Error Types

<!-- Custom error classes/types -->

(To be filled by the team)

---

## Error Handling Patterns

<!-- Try-catch patterns, error propagation -->

(To be filled by the team)

---

## API Error Responses

<!-- Standard error response format -->

- Errors are returned as `HTTPException(detail=<中文 message>)`; the frontend shows `detail` via antd message.
- **401 is reserved for JWT/session expiry only.** The frontend axios interceptor treats any 401 as a logged-out session (clears token, redirects to login). Business-level credential failures (e.g. SMB share login) must return **403** or the user gets logged out of the whole site.
- See [SMB Access](./smb-access.md) for the full error matrix of the file manager module.

---

## Common Mistakes

<!-- Error handling mistakes your team has made -->

(To be filled by the team)
