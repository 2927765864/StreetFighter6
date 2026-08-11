# ADR-001: Logic FPS = 60

## Status
Accepted (MVP)

## Context
Fighting-game frame data is expressed in frames at a fixed rate. Consensus uses data-driven startup/active/recovery.

## Decision
`LOGIC_FPS = 60`, `LOGIC_DT = 1/60`. Simulation uses Gaffer-style fixed timestep; render uses rAF.

## Consequences
Move tables use 60 Hz frame counts. Changing GUI `logicFps` rebuilds the clock for experiments only.
