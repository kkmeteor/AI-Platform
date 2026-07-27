#!/usr/bin/env python3
"""
Upload a skill directory to the SkillMarket server.

Zips the skill directory, base64 encodes it, and POSTs to the API.
"""

import argparse
import base64
import io
import json
import os
import sys
import zipfile

try:
    import requests
except ImportError:
    print("Error: 'requests' library is required. Install with: pip install requests")
    sys.exit(1)

SERVER_URL = "http://10.10.11.194:9090/api/skills"


def get_current_username():
    """Get the current logged-in username."""
    try:
        return os.getlogin()
    except OSError:
        return os.environ.get("USERNAME", os.environ.get("USER", "unknown"))


def zip_directory(directory_path):
    """Zip a directory into a bytes buffer."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(directory_path):
            # Skip hidden directories and __pycache__
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
            for file in files:
                if file.startswith("."):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, directory_path)
                zf.write(file_path, arcname)
    buffer.seek(0)
    return buffer.getvalue()


def upload_skill(skill_dir, name, author, description, version, tags):
    """Zip, encode, and upload a skill directory to the server."""
    if not os.path.isdir(skill_dir):
        print(f"Error: Directory not found: {skill_dir}")
        sys.exit(1)

    print(f"Zipping skill directory: {skill_dir}")
    zip_data = zip_directory(skill_dir)
    print(f"Zip size: {len(zip_data)} bytes")

    file_base64 = base64.b64encode(zip_data).decode("utf-8")
    file_name = f"{name}.zip"

    payload = {
        "name": name,
        "description": description or "",
        "author": author or get_current_username(),
        "version": version or "1.0.0",
        "tags": tags or "",
        "file_name": file_name,
        "file_base64": file_base64,
    }

    print(f"Uploading to {SERVER_URL} ...")
    try:
        resp = requests.post(
            SERVER_URL,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=60,
        )
    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to server at {SERVER_URL}")
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("Error: Request timed out")
        sys.exit(1)

    if resp.status_code in (200, 201):
        print("Upload successful!")
        try:
            data = resp.json()
            print(f"  ID: {data.get('id', 'N/A')}")
            print(f"  Name: {data.get('name', 'N/A')}")
        except Exception:
            print(f"  Response: {resp.text[:200]}")
    else:
        print(f"Upload failed (HTTP {resp.status_code})")
        print(f"  Response: {resp.text[:500]}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Upload a skill to the SkillMarket server")
    parser.add_argument("skill_dir", help="Path to the skill directory")
    parser.add_argument("--name", required=True, help="Skill name")
    default_author = get_current_username()
    parser.add_argument("--author", default=default_author, help=f"Author name (default: current user '{default_author}')")
    parser.add_argument("--description", default="", help="Skill description")
    parser.add_argument("--version", default="1.0.0", help="Version string")
    parser.add_argument("--tags", default="", help="Comma-separated tags")

    args = parser.parse_args()
    upload_skill(args.skill_dir, args.name, args.author, args.description, args.version, args.tags)


if __name__ == "__main__":
    main()
