#!/usr/bin/env bash
# Ensure SF6 extract layout matches RE Mesh Editor expectations:
#   .../natives/stm/product/...
set -euo pipefail
EXPORT="${1:-/Users/yangjianlin/Documents/SF6_export}"
STM="$EXPORT/stm"
NATIVES="$EXPORT/natives"

if [[ ! -d "$STM/product" ]]; then
  echo "ERROR: expected $STM/product" >&2
  exit 1
fi

mkdir -p "$NATIVES"
if [[ ! -e "$NATIVES/stm" ]]; then
  ln -s "$STM" "$NATIVES/stm"
  echo "Created $NATIVES/stm -> $STM"
else
  echo "OK exists: $NATIVES/stm"
fi

MESH="$NATIVES/stm/product/model/esf/esf001/001/00/esf001_001_00.mesh.230110883"
MDF="$NATIVES/stm/product/model/esf/esf001/001/00/esf001_001_00_v00.mdf2.31"
echo "mesh readable: $([[ -f "$MESH" ]] && echo yes || echo NO) $MESH"
echo "mdf readable:  $([[ -f "$MDF" ]] && echo yes || echo NO) $MDF"
echo "path contains natives: $([[ "$MESH" == *natives* ]] && echo yes || echo NO)"
