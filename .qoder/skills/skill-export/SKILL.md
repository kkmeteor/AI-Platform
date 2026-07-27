---
name: skill-export
description: Export a project-level or global-level skill by packaging it into a zip file and saving it to the user's Downloads directory. Use when the user wants to export, package, or share a skill.
---

# Skill Export

## Instructions

When the user wants to export a skill, follow these steps:

1. **Identify the skill name** from the user's request (e.g., "weather-query")

2. **Locate the skill** by searching in the following order:
   - **Project-level skills**: `{workspace}/.qoder/skills/{skill-name}/`
   - **Global-level skills**: `{user-profile}/.qoder/skills/{skill-name}/`
   
   Use the `list_dir` tool to check both locations. If the user doesn't specify which level, search project-level first, then global-level. If the skill is not found in either location, inform the user and list all available skills from both directories.

3. **List all available skills** if needed:
   - Run `list_dir` on `{workspace}/.qoder/skills/` for project-level skills
   - Run `list_dir` on `{user-profile}/.qoder/skills/` for global-level skills
   - `{user-profile}` can be obtained by running `echo $env:USERPROFILE` in the terminal

4. **Package the skill** into a zip file:
   - Use PowerShell's `Compress-Archive` command
   - The zip file name should be `{skill-name}.zip` (e.g., `weather-query.zip`)
   - Target path: `C:\Users\{userName}\Downloads\{skill-name}.zip`
   - If the zip file already exists, add `-Force` parameter to overwrite it
   
   Example command:
   ```powershell
   Compress-Archive -Path "{skill-folder-path}\*" -DestinationPath "C:\Users\{userName}\Downloads\{skill-name}.zip" -Force
   ```

5. **Confirm success** to the user:
   - Show the full path of the exported zip file
   - Show the file size if possible
   - Mention which level (project/global) the skill was exported from

## Important Notes

- The `{workspace}` is the current project workspace root directory
- The `{user-profile}` is the current user's home directory (obtained via `$env:USERPROFILE`)
- The Downloads directory path is: `C:\Users\{userName}\Downloads\`
- If the skill folder contains subdirectories, they will be included in the zip automatically
- Always verify the skill exists before attempting to zip it
- If multiple skills match or the name is ambiguous, ask the user to clarify

## Example Usage

User: "导出 weather-query skill"
User: "export skill pdf-extractor"
User: "将 skill weather-query 打包"
