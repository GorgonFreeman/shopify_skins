#!/usr/bin/env bash
# Open this folder + chrome://extensions so you can Load unpacked.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

open "$ROOT"

if ! open -a "Google Chrome" "chrome://extensions/" 2>/dev/null; then
  echo "Could not open Google Chrome. Open chrome://extensions yourself, then Load unpacked →:" >&2
  echo "  $ROOT" >&2
  exit 1
fi

cat <<EOF
Load unpacked → select the folder that just opened:

  $ROOT

Enable Developer mode on the extensions page if you do not see Load unpacked.
EOF
