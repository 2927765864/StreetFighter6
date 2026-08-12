#!/usr/bin/env bash
# Rebuild all Ryu body motlist batch GLBs with dense+conjugate bind.
# Categories: basic / attack / specialskill / superarts (body, not facial).
set -u

BLENDER="${BLENDER:-/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender}"
PROJECT="${PROJECT:-/Users/yangjianlin/Library/Mobile Documents/com~apple~CloudDocs/GameProject/StreetFighter6}"
ROOT="${ROOT:-$PROJECT/tools/re_motlist}"
NAT="${NAT:-/Users/yangjianlin/Documents/SF6_export/natives/stm}"
MLROOT="${MLROOT:-$NAT/product/animation/esf/esf001/v00/motionlist}"
OUTROOT="${OUTROOT:-$PROJECT/private/assets/ryu/anims}"
PIPELINE="$ROOT/scripts/pipeline_ryu_batch_motlist.py"
LOG="$OUTROOT/_batch_rebuild_dense.log"
SUMMARY="$OUTROOT/_batch_rebuild_dense_summary.txt"

mkdir -p "$OUTROOT"
: >"$LOG"
: >"$SUMMARY"

echo "=== batch rebuild dense start $(date) ===" | tee -a "$LOG"
echo "blender=$BLENDER" | tee -a "$LOG"
echo "pipeline=$PIPELINE" | tee -a "$LOG"
echo "motlist_root=$MLROOT" | tee -a "$LOG"
echo "out_root=$OUTROOT" | tee -a "$LOG"
echo "bind=mot_absolute_full_chain + mot_conjugate + dense_lerp_slerp" | tee -a "$LOG"

if [[ ! -x "$BLENDER" ]]; then
  echo "FATAL: Blender not executable: $BLENDER" | tee -a "$LOG"
  exit 2
fi
if [[ ! -f "$PIPELINE" ]]; then
  echo "FATAL: pipeline missing: $PIPELINE" | tee -a "$LOG"
  exit 2
fi
if [[ ! -d "$MLROOT" ]]; then
  echo "FATAL: motlist root missing: $MLROOT" | tee -a "$LOG"
  exit 2
fi

# Bash 3 compatible (macOS /bin/bash): no mapfile
MOTLISTS_FILE=$(mktemp)
find "$MLROOT/basic" "$MLROOT/attack" "$MLROOT/specialskill" "$MLROOT/superarts" \
  -name "*.motlist.653" 2>/dev/null | sort >"$MOTLISTS_FILE"
n_lists=$(wc -l <"$MOTLISTS_FILE" | tr -d ' ')
echo "motlists=$n_lists" | tee -a "$LOG"
if [ "$n_lists" -eq 0 ]; then
  echo "FATAL: no motlists found" | tee -a "$LOG"
  rm -f "$MOTLISTS_FILE"
  exit 2
fi

ok_lists=0
err_lists=0
total_ok=0
total_err=0
total_skip=0
fail_file=$(mktemp)

idx=0
while IFS= read -r ml; do
  [ -z "$ml" ] && continue
  idx=$((idx + 1))
  stem=$(basename "$ml")
  stem=${stem%.motlist.653}
  stem=${stem%.motlist}
  cat=$(basename "$(dirname "$ml")")
  out="$OUTROOT/$cat/$stem"
  echo "" | tee -a "$LOG"
  echo "========== $(date +%H:%M:%S) [$idx/$n_lists] START $cat/$stem ==========" | tee -a "$LOG"

  mkdir -p "$out"
  set +e
  "$BLENDER" --background --python "$PIPELINE" -- \
    --stage full \
    --natives-stm "$NAT" \
    --motlist "$ml" \
    --out-dir "$out" \
    --clean-glb \
    >>"$LOG" 2>&1
  rc=$?
  set -e

  ok=0
  err=0
  skip=0
  if [ -f "$out/catalog.json" ]; then
    counts=$(python3 -c "import json;c=json.load(open(r'''$out/catalog.json'''));print(c.get('ok_count',0),c.get('error_count',0),c.get('skip_count',0))")
    ok=$(echo "$counts" | awk '{print $1}')
    err=$(echo "$counts" | awk '{print $2}')
    skip=$(echo "$counts" | awk '{print $3}')
  fi

  if [ "$rc" -ne 0 ] || [ "${err:-0}" -gt 0 ]; then
    err_lists=$((err_lists + 1))
    echo "$cat/$stem rc=$rc ok=$ok err=$err" >>"$fail_file"
    echo "[FAIL] $cat/$stem rc=$rc ok=$ok errors=$err skip=$skip" | tee -a "$LOG" | tee -a "$SUMMARY"
  else
    ok_lists=$((ok_lists + 1))
    echo "[done] $cat/$stem ok=$ok errors=$err skip=$skip" | tee -a "$LOG" | tee -a "$SUMMARY"
  fi
  total_ok=$((total_ok + ok))
  total_err=$((total_err + err))
  total_skip=$((total_skip + skip))
done <"$MOTLISTS_FILE"
rm -f "$MOTLISTS_FILE"

echo "" | tee -a "$LOG" | tee -a "$SUMMARY"
echo "=== batch rebuild dense end $(date) ===" | tee -a "$LOG" | tee -a "$SUMMARY"
echo "lists_ok=$ok_lists lists_fail=$err_lists total_lists=$n_lists" | tee -a "$LOG" | tee -a "$SUMMARY"
echo "clips_ok=$total_ok clips_err=$total_err clips_skip=$total_skip" | tee -a "$LOG" | tee -a "$SUMMARY"
if [ -s "$fail_file" ]; then
  echo "failures:" | tee -a "$LOG" | tee -a "$SUMMARY"
  while IFS= read -r f; do
    echo "  - $f" | tee -a "$LOG" | tee -a "$SUMMARY"
  done <"$fail_file"
  rm -f "$fail_file"
  exit 1
fi
rm -f "$fail_file"
exit 0
