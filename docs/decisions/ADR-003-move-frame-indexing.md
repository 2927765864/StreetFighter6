# ADR-003: Move frame indexing

## Status
Accepted (MVP)

## Context
Off-by-one between “startup 4” community notation and 0-based code is a common FG bug.

## Decision
- `moveFrame` is **0-based**.
- Hit active when: `moveFrame >= (startup - 1) && moveFrame < (startup - 1 + active)`.
- Example: startup=4, active=2 → active on frames **3 and 4**.
- Timed boxes `from`/`to` are inclusive on `moveFrame` and take priority for geometry.

## Consequences
Unit tests lock the active set. Re-verify when importing FAT/SuperCombo tables.
