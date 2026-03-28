# Change Guardrails Checklist

This is the baseline workflow for every new change in `x21`.

## Non-Negotiables

- Keep each change focused and commit it as soon as it is done.
- Stage only the files that belong to the current change.
- If a bug fix touches testable logic, add or update a regression test in the same change.
- If automated coverage is not practical yet, capture the exact manual verification path you ran.

## Checklist For Every Change

1. Confirm the blast radius before editing.
   Write down which screens, routes, shared services, parsers, caches, storage keys, or build settings could be affected.
2. Add the right safety net while you make the change.
   Prefer a regression test for pure logic, parsers, services, and utility functions. For UI-heavy work, note the manual smoke path you will run.
3. Run the automated commit gate.
   Use `npm run guardrails:staged`. The `pre-commit` hook runs the same command against the staged snapshot.
4. Smoke the affected flow manually.
   Cover the happy path, the last-broken path, empty/loading/error states if touched, and confirm there are no new console errors.
5. Escalate to the full pass for risky changes.
   Run `npm run guardrails:full` when the change touches shared state, routing, event/content parsing, uploads, caching, auth, service worker/PWA behavior, dependencies, or build/config files.
6. Commit immediately after the checks are green.
   Re-check `git status --short`, then commit the finished change before starting the next one.

## Commands

```bash
npm run guardrails:staged
npm run guardrails:full
git status --short
git commit -m "Describe the finished change"
```

## Regression-Test Targets

- Utility functions in `src/lib`
- Shared services in `src/services`
- Parsing, normalization, and cache behavior
- Any bug that already has a clear reproduction path
- The current automated harness is optimized for pure TypeScript logic, not browser/UI interaction

## Current Limits

- The app does not yet have broad end-to-end coverage, so manual smoke checks are still part of the checklist.
- When a change is too UI-specific for a fast unit test, document the manual verification steps in the commit body or follow-up notes.
