# estimate_root_motion

Offline tool (plan Step 5): sample glb root/hips track → `selfMovement[]`.

## Status

Scaffold for Node + three GLTFLoader. Full sampling script to be run when private anims path is available in CI.

## Intended usage

```bash
# from app/ or repo root with three installed
node tools/estimate_root_motion/estimate_move_dx.mjs \
  --glb private/assets/ryu/anims/.../2hk.glb \
  --total 34 \
  --out /tmp/ryu_2hk_dx.json
```

Algorithm: `logicFrameToClipTime(i, total, duration, 'uniform')` then delta root X (forward) per frame.

See `docs/plans/ai-execution-plan-anim-loco-feet-displace-v0.md` Step 5.
