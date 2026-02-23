#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/bazel-bin/wasm/mpcc_wasm"
DEST="$SCRIPT_DIR/web"

if [[ ! -d "$SRC" ]]; then
  echo "error: build artifacts not found at $SRC" >&2
  echo "       run: bazel build --cpu=wasm //wasm:mpcc_wasm" >&2
  exit 1
fi

cp -f "$SRC/mpcc_wasm_base.js"   "$DEST/mpcc_wasm_base.js"
cp -f "$SRC/mpcc_wasm_base.wasm" "$DEST/mpcc_wasm_base.wasm"

echo "copied wasm artifacts to $DEST"
