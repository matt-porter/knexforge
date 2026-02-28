# Contributing to K'NexForge

First off, thank you for considering contributing to K'NexForge! It's people like you that make this an awesome open-source tool for the community.

## 🤖 AI Agents & Automated Assistants

If you are an AI coding agent (Claude, Grok, Codex, Cursor, etc.), please **STOP** and read the following documents before proceeding:
1. `AGENTS.md` (Strict coding standards and core principles)
2. `docs/AGENT-ONBOARDING.md` (Repository structure and setup guide)
3. `docs/QUICK-REFERENCE.md` (Cheat sheet for commands and endpoints)

These documents are your single source of truth for repository structure, styling, and commands. 

## 🧑‍💻 Human Contributors

We welcome contributions from everyone. Whether you're fixing a bug, adding a new part, or improving the documentation, your help is appreciated.

### Getting Started

1. **Fork the repository** and clone it locally.
2. **Set up the environment**:
   - Python 3.12+ is required.
   - We recommend using a virtual environment.
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # macOS/Linux
   # or
   .venv\Scripts\activate     # Windows
   
   pip install -e ".[dev,physics,meshgen,ai]"
   ```
3. **Set up the frontend**:
   ```bash
   cd frontend
   npm install
   ```

### How to Contribute

#### Adding a New Part
The easiest way to contribute is to add missing K'Nex parts!
1. Add the part JSON definition to `parts/`.
2. Provide the `.scad` or `.glb` mesh in `parts/meshes/`.
3. If using OpenSCAD, run `python tools/generate_meshes.py --part <your-part-id>`
4. Add a test case in `src/core/tests/test_parts.py` to ensure it loads correctly.

#### Reporting Bugs
If you find a bug, please create an issue with:
- A clear title and description.
- Steps to reproduce the bug.
- The expected behavior versus actual behavior.
- Any relevant logs or screenshots.

#### Submitting a Pull Request
1. Create a new branch for your feature or bug fix: `git checkout -b feature/my-new-feature` or `fix/bug-name`.
2. Make your changes, ensuring you follow the project's coding standards (`ruff` and `pyright` for Python, `eslint` for TypeScript).
3. Write or update tests as necessary. All new core features must have tests.
4. Run tests: `pytest src/core/tests/` and `npm run test` in the frontend directory.
5. Commit your changes using Conventional Commits (e.g., `feat(core): add new part` or `fix(frontend): resolve snapping bug`).
6. Push your branch and submit a Pull Request.

### Pull Request Checklist
Before submitting your PR, please ensure:
- [ ] Tests pass locally.
- [ ] Code is formatted and passes type checks.
- [ ] Documentation is updated (if applicable).
- [ ] You have provided a clear description of the changes in the PR.

## License

By contributing to K'NexForge, you agree that your contributions will be licensed under the MIT License.