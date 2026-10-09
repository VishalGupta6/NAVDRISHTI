# 🤝 Contributing to Indian Navy MDA System

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for contributing.

---

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Getting Started](#-getting-started)
- [Development Workflow](#-development-workflow)
- [Code Style](#-code-style)
- [Testing](#-testing)
- [Commit Convention](#-commit-convention)
- [Pull Request Process](#-pull-request-process)
- [Reporting Issues](#-reporting-issues)
- [Project Structure Overview](#-project-structure-overview)

---

## 📜 Code of Conduct

- Be respectful and constructive in all interactions.
- Focus on technical merit in code reviews.
- Follow security best practices — this is a defence-grade system.

---

## 🚀 Getting Started

1. **Fork** this repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/indian-navy-2.0.git
   cd indian-navy-2.0
   ```
3. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Install dependencies**:
   ```bash
   # Backend
   pip install -r requirements.txt

   # Frontend
   cd indian/frontend
   npm install
   cd ../..
   ```
5. **Start the dev server**:
   ```bash
   bash run_local.sh
   ```

---

## 🔄 Development Workflow

### Backend (FastAPI)

- Backend code lives in `indian/backend/`.
- Add new API routes under `indian/backend/routes/` as separate router files.
- Register new routers in `indian/backend/main.py` via `app.include_router(...)`.
- Use Swagger tags to keep the API documentation organized:
  ```python
  router = APIRouter(prefix="/api/your-feature", tags=["Your Tag Name"])
  ```
- Business logic should be in `indian/backend/services/`.

### Frontend (React + Vite)

- Frontend code lives in `indian/frontend/src/`.
- Each component should have its own directory under `src/components/` with a `.jsx` and `.css` file.
- Use functional components with React hooks.
- Run the dev server with hot-reload:
  ```bash
  cd indian/frontend
  npm run dev
  ```

### ML Engine

- ML models and pipelines live in `indian/ml_engine/`.
- Any new detection model should expose a standard interface that the detection service can call.

---

## 🎨 Code Style

| Layer | Formatter | Linter | How to Run |
|-------|-----------|--------|------------|
| **Python** | [Black](https://black.readthedocs.io/) | [Flake8](https://flake8.pycqa.org/) | `black indian/backend/` / `flake8 indian/backend/` |
| **JavaScript/JSX** | [Prettier](https://prettier.io/) | [ESLint](https://eslint.org/) | `npx prettier --write .` / `npx eslint .` |
| **CSS** | [Prettier](https://prettier.io/) | — | `npx prettier --write "**/*.css"` |

### Key Rules

- **Python**: 4-space indentation, type hints for function parameters, docstrings for all public functions.
- **JavaScript**: 2-space indentation, `const`/`let` only (no `var`), arrow functions preferred.
- **Imports**: Keep imports sorted — stdlib → third-party → local.

---

## 🤖 AI Development & Ponytail Guidelines

This project uses the **Ponytail Decision Ladder** for AI-assisted development ("the best code is the code you never wrote").

When using AI assistants (Claude Code, Cursor, Copilot, Antigravity, etc.) on `indian-navy-2.0`, enforce the following 7-step checklist:

1. **Does this need to exist? (YAGNI)**: Avoid unnecessary features or boilerplate.
2. **Already in this codebase?**: Reuse existing utilities in `indian/backend/` and `indian/frontend/src/`.
3. **Stdlib does it?**: Use Python standard library or JS built-ins.
4. **Native platform feature?**: Use native HTML5/CSS elements before adding UI libraries.
5. **Installed dependency?**: Rely on existing packages in `requirements.txt` and `package.json`.
6. **Can it be one line?**: Prefer clean, concise language primitives.
7. **Only then**: Write the minimum necessary code.

Project-level rules files are configured in:
- `.github/copilot-instructions.md` (GitHub Copilot)

---


## 📝 Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

### Types

| Type | When to Use |
|------|-------------|
| `feat` | A new feature or endpoint |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, missing semicolons (no code change) |
| `refactor` | Code refactoring (no feature/bug change) |
| `test` | Adding or updating tests |
| `chore` | Build process, dependency updates |
| `perf` | Performance improvement |

### Examples

```
feat(vessels): add convoy radar endpoint
fix(websocket): resolve disconnect on idle timeout
docs(readme): add screenshots and contribution guide
chore(docker): bump Python base image to 3.11-slim
```

---

## 🔀 Pull Request Process

1. **Ensure your branch is up to date** with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. **Run linting and tests** before pushing.
3. **Update documentation** if you added or changed any API endpoints or UI components.
4. **Add screenshots** for any visual/UI changes.
5. **Submit a PR** with:
   - A clear, descriptive title following the commit convention.
   - A description of *what* changed and *why*.
   - Links to related issues (e.g., `Closes #42`).
6. **Respond to review feedback** promptly.
7. At least **one maintainer approval** is required before merging.

---

## 🐛 Reporting Issues

Use GitHub Issues and include:

- **Bug label**: For defects and unexpected behavior.
- **Enhancement label**: For feature requests.
- **Documentation label**: For doc improvements.

### Bug Report Template

```
**Describe the bug**: A clear description of the issue.

**Steps to reproduce**:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**: What should happen.

**Actual behavior**: What actually happens.

**Screenshots**: If applicable.

**Environment**:
- OS: [e.g., macOS 15, Ubuntu 22.04]
- Python version: [e.g., 3.11.5]
- Node.js version: [e.g., 20.10.0]
- Docker version: [e.g., 24.0.7]
```

---

## 🏛️ Project Structure Overview

```
indian-navy-2.0/
├── indian/
│   ├── backend/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── routes/
│   │   │   ├── vessels.py       # /api/vessels/* — Tag: Vessels
│   │   │   ├── anomalies.py     # /api/anomalies/* — Tag: Anomaly Detection
│   │   │   └── risk.py          # /api/risk/* — Tag: Risk Profiles
│   │   └── services/
│   │       ├── detection_service.py  # ML pipeline orchestration
│   │       └── live_bridge.py        # WebSocket AIS bridge
│   ├── frontend/
│   │   └── src/components/      # React components
│   ├── ml_engine/               # ML models (DBSCAN, LSTM, EKF)
│   └── simulation/              # AIS data simulator
├── docs/screenshots/            # UI screenshots
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Container orchestration
└── requirements.txt             # Python dependencies
```

---

*Classification: RESTRICTED — Strategic Asset Deployment Documentation*