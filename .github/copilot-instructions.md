# GitHub Copilot Instructions — Ponytail Decision Ladder

When assisting in this repository:
1. **Prefer Minimal Solutions**: Always select the simplest implementation that fulfills the user's requirement without extra boilerplate.
2. **Reuse Existing Code**: Check existing FastAPI endpoints in `indian/backend/routes/` and React components in `indian/frontend/src/` before proposing new code.
3. **Avoid Unnecessary Packages**: Utilize existing dependencies in `requirements.txt` and `package.json` or standard libraries.
4. **Preserve System Integrity**: Keep security contracts (`NAVY2026` passcode), websocket real-time channels, and ML detection pipelines intact.