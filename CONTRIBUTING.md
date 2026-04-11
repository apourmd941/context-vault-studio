# Contributing

## Goals

Contributions should make Context Vault Studio:

- safer
- more reliable
- more explainable
- more useful for curated AI workspaces

## Development Setup

1. Create the Python environment and install backend dependencies.
2. Install frontend dependencies with `npm --prefix frontend install`.
3. Run the app locally with `./start.sh` or `./start.ps1`.

## Before Opening a PR

Run:

```bash
./.venv/bin/python -m pytest backend/tests -q
./.venv/bin/python -m ruff check backend scripts tools
npm --prefix frontend test
npm --prefix frontend run build
```

## Contribution Expectations

- Keep the access-boundary model explicit and auditable.
- Prefer additive, well-scoped changes over hidden magic.
- Preserve cross-platform behavior.
- Add or update tests when changing backend behavior, graph logic, search helpers, or access policy handling.
- Document any operator-visible workflow changes in `README.md`, `AGENTS.md`, or `REQUIREMENTS.md` as needed.

## Good First Areas

- graph interaction improvements
- search and preview polish
- import and export workflows
- accessibility improvements
- packaging and release workflows

## Security

If you find a security issue, do not open a public issue first. Follow `SECURITY.md`.
