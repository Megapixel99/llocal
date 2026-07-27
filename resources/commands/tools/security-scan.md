---
description: Review code for security vulnerabilities and suggest fixes
argument-hint: [code or description of the system]
allowed-tools: none
---

Perform a focused security review of the following:

$ARGUMENTS

Look specifically for:
- Injection flaws (SQL, command, template, XSS).
- Broken authentication or authorization.
- Sensitive data exposure and hardcoded secrets.
- Insecure deserialization and unsafe input handling.
- Vulnerable or outdated dependencies.

For every issue you find, report:
- **Severity** (critical / high / medium / low).
- **Location** and a short explanation of the risk.
- **Fix** — concrete, minimal code changes.

If you find no issues in a category, say so explicitly rather than omitting it.
