# ADR-002: Hit/hurt box center convention

## Status
Accepted (MVP)

## Context
AABB overlap needs a single origin convention to avoid silent off-by-half-size bugs.

## Decision
`x,y` are **center**; `w,h` are **full** width/height. Facing-relative locals: `world.x = originX + facing * local.x`.

## Consequences
JSON in `public/data/moves/*.json` must follow this. Debug draw uses the same mapping.
