# Context Vault Studio Release Readiness

This file tracks the current release-hardening surface for the app.

## Current State

The repo now includes:

- simplified guided-demo-first UI flow
- reusable snapshot bundles
- governed Build adapter contracts
- deterministic no-model Build planning
- scratch patch previews
- scratch apply and reconciliation runs
- parallel scan profiling
- delta snapshots
- live monitor polling and flush batches
- logic profiles
- explain bundles
- unified history timeline

## Release Checklist

- [x] backend tests pass locally
- [x] backend lint passes locally
- [x] frontend unit tests pass locally
- [x] frontend production build passes locally
- [x] guided demo dry-run succeeds
- [x] docs reflect the guided demo and simplified UI
- [x] docs reflect the v2 backend surfaces through Phase 21
- [x] skip-CI push convention is documented in practice for this repo history

## Still Worth Doing Later

- [ ] end-to-end browser tests for the guided demo and advanced flows
- [ ] packaged desktop distribution flow
- [ ] more polished screenshots and walkthrough assets
- [ ] frontend surfaces for the new v2 backend artifacts
- [ ] stronger production UX around Build, Logic, Explain, and history views

## Local Verification Commands

```bash
python3 -m pytest backend/tests -q
python3 -m ruff check backend scripts tools
npm --prefix frontend test
npm --prefix frontend run build
python3 tools/build_context_workspace.py --config configs/guided_demo.json --dry-run
```
