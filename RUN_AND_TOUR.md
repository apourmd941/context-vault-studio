# Run And Tour

## Start the app

macOS or Linux:

```bash
cd /Users/aidin/NeutronDev/obsidien\ style\ mapping && ./stop.sh && ./start.sh
```

Then open:

```text
http://127.0.0.1:12046
```

## Best first run

1. stay on `Vault`
2. click `Load guided demo`
3. wait for preview to complete
4. open `Graph` or `Notes`
5. if you want the generated vault on disk, click `Build vault`

## Digital Brain setup

The `Digital brain` lane now exposes:

- its own setup controls for scan mode, graph density, enrichment mode, and retention mode
- source adapter status cards
- a canonical index summary showing source objects, episodes, and graph counts from the latest approved-workspace intake

## Graph controls

In `Graph`, the current renderer is a true WebGL 3D scene.

- left-drag or trackpad drag to orbit
- right-drag to pan
- mouse wheel or pinch to zoom
- click a node to focus it and sync the notes pane selection
- drag a node to pin it in space
- right-click a pinned node to release it
- use `Find node` to search the full indexed graph, even when the scene is render-capped

## New v2 artifact tools

The `V2 studio` panel exposes the newer backend capabilities:

- `Logic profile`
  builds a code-aware logic profile from the current scope
- `Explain bundle`
  combines the current snapshot and latest logic profile into a reusable explanation bundle
- `Patch preview`
  creates a deterministic no-model patch preview
- `Apply latest preview`
  applies that preview only into scratch space and records a reconciliation report
- `Delta snapshot`
  compares the current scope to the latest snapshot bundle
- `Parallel scan`
  profiles the current scope through the new parallel scan pipeline
- `Compare snapshots`
  compares the newest two snapshot bundles

## Browser smoke test

If the app is already running locally, you can verify the browser scaffold with:

```bash
npm --prefix frontend run test:e2e
```

## Desktop scaffold

The repo now includes a lightweight Electron wrapper in `desktop/`.

To verify the packaging scaffold locally:

```bash
cd /Users/aidin/NeutronDev/obsidien\ style\ mapping/desktop
npm install
npm run dist -- --dir
```

That produces an unpacked app bundle for local inspection, not a signed release.

## What is real now

- guided demo and simplified UI flow
- true WebGL graph view with large-graph render caps and indexed-node search
- reusable snapshot bundles
- deterministic no-model Build planning
- scratch patch previews
- scratch apply and reconciliation
- parallel scan profiling
- delta snapshots
- live monitor polling
- logic profiles
- explain bundles
- unified history timeline

## What is still scaffolded

- browser E2E is present as a scaffold with a smoke test
- desktop packaging is scaffolded, not a fully signed release
- the frontend exposes the newest backend artifacts in a compact panel, not a full dedicated v2 dashboard yet
