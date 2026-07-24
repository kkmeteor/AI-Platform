---
name: skill-download
description: Download a skill zip from a URL and import it into the current project. Use when the user provides a download link for a skill, or wants to download and install a skill from the marketplace.
---

# Skill Download

Download a skill zip file from a URL to the user's Downloads directory, then import it into the current project using the skill-import process.

## Instructions

When the user wants to download and import a skill from a URL:

1. **Get the download URL** from the user's request. The URL should point to a skill zip file, e.g.:
   - `http://localhost:5173/api/skills/2/download`
   - `http://10.10.11.194:9090/api/skills/5/download`

2. **Determine the Downloads directory**:
   - Get the current username: `echo $env:USERNAME`
   - Downloads path: `C:\Users\{userName}\Downloads\`

3. **Download the file** to the Downloads directory:
   - Extract a filename from the URL or use the skill name if provided
   - Use PowerShell to download:
     ```powershell
     $url = "{download-url}"
     $downloadsDir = "C:\Users\$env:USERNAME\Downloads"
     $fileName = "{skill-name}.zip"
     $outputPath = Join-Path $downloadsDir $fileName
     Invoke-WebRequest -Uri $url -OutFile $outputPath
     ```
   - If the URL does not end with `.zip`, append `.zip` to the downloaded file name
   - Verify the file was downloaded successfully

4. **Import the skill** using the skill-import process:
   - Follow the skill-import SKILL.md instructions to import the downloaded zip file
   - The zip file is now located in the Downloads directory at `$outputPath`
   - Inspect the zip contents, determine skill name, install to `.qoder/skills/{skill-name}/`
   - Verify `SKILL.md` exists in the target directory

5. **Report results** to the user:
   - The download URL
   - The downloaded file path
   - The installed skill name and path
   - The contents of the installed skill directory

## Error Handling

- If the download fails (network error, 404, etc.), report the error and stop
- If the downloaded file is not a valid zip or does not contain `SKILL.md`, inform the user
- If a skill with the same name already exists, ask the user whether to overwrite

## Examples

User: "Download and install skill from http://localhost:5173/api/skills/2/download"
User: "Download skill from http://10.10.11.194:9090/api/skills/5/download"
User: "http://localhost:9090/api/skills/3/download 下载并安装这个skill"
