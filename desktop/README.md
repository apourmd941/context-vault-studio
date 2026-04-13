# Context Vault Studio Desktop

This is a lightweight Electron wrapper for the app.

## Local usage

1. start the main app normally from the repo root
2. from `desktop/`, install dependencies
3. run Electron against the local frontend URL

```bash
cd desktop
npm install
CONTEXT_VAULT_DESKTOP_URL=http://127.0.0.1:12046 npm run dev
```

## Packaging

```bash
cd desktop
npm install
npm run dist
```

This is a scaffolded packaging path, not a fully signed desktop release yet.
