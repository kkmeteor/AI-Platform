---
name: skill-upload
description: Upload a project skill to the remote SkillMarket server. Use when the user wants to publish, deploy, or upload a skill to the server, or mentions uploading skills to the marketplace.
---

# Skill Upload

Upload a project skill directory to the SkillMarket server by zipping it, base64 encoding, and POSTing to the API.

## Instructions

When the user wants to upload a skill to the server:

1. Identify the skill directory to upload (default: `.qoder/skills/<skill-name>/`)
2. Collect metadata from the user (or infer from SKILL.md frontmatter):
   - `name`: Skill name (required)
   - `author`: Author name (optional, default: current logged-in username)
   - `description`: Skill description (optional)
   - `version`: Version string (optional, default: "1.0.0")
   - `tags`: Comma-separated tags (optional)
3. Run the upload script:

```bash
python .qoder/skills/skill-upload/scripts/upload_skill.py <skill-directory> --name <name> --author <author> --description <description> --version <version> --tags <tags>
```

4. The script will:
   - Zip the skill directory into `<skill-name>.zip`
   - Base64 encode the zip file
   - POST to `http://10.10.11.194:9090/api/skills`
   - Print the server response

## Server API

- **Endpoint**: `POST http://10.10.11.194:9090/api/skills`
- **Content-Type**: `application/json`
- **Request Body**:
```json
{
  "name": "skill-name",
  "description": "description text",
  "author": "author name",
  "version": "1.0.0",
  "tags": "tag1,tag2",
  "file_name": "skill-name.zip",
  "file_base64": "<base64-encoded-zip-content>"
}
```

## Examples

Upload the `pdf-extractor` skill:
```bash
python .qoder/skills/skill-upload/scripts/upload_skill.py .qoder/skills/pdf-extractor --name pdf-extractor --author "John" --description "Extract text from PDFs" --version "1.0.0" --tags "pdf,utility"
```

Upload with minimal info (name only):
```bash
python .qoder/skills/skill-upload/scripts/upload_skill.py .qoder/skills/my-skill --name my-skill
```
