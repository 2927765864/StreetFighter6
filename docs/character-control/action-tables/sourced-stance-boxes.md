# Sourced stance boxes (Ryu)

> Auto-summary from MMDK convert — not raw dump.  
> Generated: 2026-08-13

| Stance | Source action | Hurt parts | Push count | unitScale |
|--------|---------------|------------|------------|-----------|
| stand | `BAS_STD_Loop` | head, body, leg (3) | 1 | 0.01 |
| crouch | `BAS_CRH_Loop` | head, body, leg (3) | 1 | 0.01 |
| air | `BAS_JUMP_N_AIR` | body (1) | 1 | 0.01 |

## Transitions (stand ↔ crouch)

MMDK DamageCollision is **segmented**, not smooth morph (typically ~4f hold source posture, then destination posture for remainder).

| Role | Source action | totalFrames | Segments | Boxes |
|------|---------------|-------------|----------|-------|
| stand_to_crouch | `BAS_STD_CRH` | 60 | 2 | 6 hurt / 2 push |
| crouch_to_stand | `BAS_CRH_STD` | 38 | 2 | 6 hurt / 2 push |

Stand geometry (local ADR-002 center/wh):

- **head**: x=0.000 y=1.661 w=0.800 h=0.379 rectId=1
- **body**: x=0.000 y=1.070 w=0.800 h=0.936 rectId=2
- **leg**: x=0.000 y=0.301 w=0.800 h=0.602 rectId=3

Air geometry (same yFit as stand):

- **body**: x=0.000 y=1.393 w=0.800 h=1.337 rectId=16
