# SF6 Ryu Training MVP (WebGPU)

Implements `docs/plans/ai-execution-plan-mvp-5lp-v0.md` Steps 0–9.

## Requirements

- Node ≥ 20
- **Desktop Chrome** with WebGPU (no WebGL fallback)
- Interim assets under `../private/interim/` (Xbot/Soldier + clip_map)

## Commands

```bash
cd app
npm install
npm test
npm run dev
```

Open the printed localhost URL in Chrome.

## Controls

| Input | Action |
|-------|--------|
| WASD / Arrows | Move / crouch |
| **U** / **1** / **Q** | Light Punch (5LP) |
| lil-gui | Sim pause/step, Dummy mode, 5LP frames, boxes, camera |

## Layout

- `src/combat/` — pure TS logic (no three)
- `src/render/` — WebGPU Three views + debug boxes
- `public/data/` — local frame tables (runtime authority)

## Notes

- 5LP JSON `review.status` is **placeholder** until manual FAT/SuperCombo review.
- Drive is HUD stub only.
- Do not commit Capcom binaries; root `.gitignore` covers `private/` and `*.glb`.
