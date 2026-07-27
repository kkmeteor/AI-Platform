---
name: skill-import
description: Import and install a skill from a zip file in the user's Downloads directory to the project-level skills directory. Use when the user wants to import, install, or load a skill from a zip package.
---

# Skill Import

## Instructions

When the user wants to import/install a skill from a zip file, follow these steps:

1. **Identify the skill name** from the user's request (optional). If not specified, use the "latest zip" strategy described below.

2. **Locate the zip file** in the user's Downloads directory:
   - Downloads path: `C:\Users\{userName}\Downloads\`
   - Get `{userName}` by running `echo $env:USERNAME` in the terminal
   
   **If the user specified a skill name:**
   - Look for `{skill-name}.zip` in the Downloads directory
   - If not found, inform the user and list available skill zip files
   
   **If the user did NOT specify a skill name (default behavior):**
   - Find the most recently modified `.zip` file in the Downloads directory whose name does NOT start with common non-skill patterns
   - Use this PowerShell command to find the latest zip:
     ```powershell
     Get-ChildItem "C:\Users\$env:USERNAME\Downloads\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
     ```
   - Confirm with the user that this is the correct zip file before proceeding

3. **Inspect the zip contents** to determine the skill structure:
   - Use `Expand-Archive` to a temporary location first, or list the archive contents
   - Check if the zip contains:
     - **Case A**: A single folder containing `SKILL.md` (e.g., `skill-name/SKILL.md`) → the folder name is the skill name
     - **Case B**: `SKILL.md` directly at the root level → derive skill name from the zip file name (without `.zip` extension)
   
   To inspect without extracting, use:
   ```powershell
   $zipPath = "C:\Users\$env:USERNAME\Downloads\{zip-file-name}"
   $tempDir = Join-Path $env:TEMP "skill-import-temp"
   if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
   Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
   ```

4. **Determine the skill name and target directory:**
   - Extract the skill name from step 3
   - Target directory: `{workspace}/.qoder/skills/{skill-name}/`
   - If a skill with the same name already exists, inform the user and ask whether to overwrite

5. **Install the skill:**
   - If the temp extraction already has the correct structure, move/copy it to the target directory
   - If the temp extraction has a wrapper folder, move the contents of that folder to the target directory
   - Use these commands:
     ```powershell
     $targetDir = "{workspace}\.qoder\skills\{skill-name}"
     if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force }
     # Copy from temp directory (adjust path based on structure)
     Copy-Item -Path "$tempDir\*" -Destination $targetDir -Recurse -Force
     # Clean up temp directory
     Remove-Item $tempDir -Recurse -Force
     ```

6. **Verify and confirm:**
   - Verify that `SKILL.md` exists in the target directory
   - Show the user:
     - The skill name that was installed
     - The target installation path
     - The contents of the installed skill directory

## Important Notes

- `{workspace}` is the current project workspace root directory
- Always inspect the zip structure before installing to handle both nested and flat zip formats
- Clean up temporary files after installation
- If the zip file does not contain a `SKILL.md` file, inform the user that it doesn't appear to be a valid skill package
- If installation fails, clean up any partial files and inform the user

## Example Usage

User: "导入 skill-export skill"
User: "install skill from zip"
User: "从下载目录安装最新的 skill"
User: "导入 C:\Users\xxx\Downloads\my-skill.zip"
