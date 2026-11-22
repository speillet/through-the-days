#!/usr/bin/env bash
# Native smoke check of the debug app bundle on macOS, using a throwaway data folder.
#
#   1. write.js   — record Morning mood/energy, write a synthetic entry, Command-S, quit.
#   2. recover.js — relaunch: the exact text and scores come back from the SQLite journal.
#   3. recover.js — relaunch with French as the system language: the interface stays English.
#
# Build the bundle first:
#   npm run tauri --workspace @through-the-days/desktop -- build --debug --bundles app
# The real application data folder and Keychain are never used (TTD_DATA_DIR is honoured by
# debug builds only). Each launch briefly shows the application window.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
app="$repo/target/debug/bundle/macos/Through the Days.app/Contents/MacOS/through-the-days"
if [ ! -x "$app" ]; then
  echo "Debug bundle not found. Build it with: npm run tauri --workspace @through-the-days/desktop -- build --debug --bundles app" >&2
  exit 1
fi

data="$(mktemp -d "${TMPDIR:-/tmp}/ttd-native-smoke.XXXXXX")"
trap 'rm -rf "$data"' EXIT

failures=0
launch() {
  local label="$1" script="$2"
  shift 2
  local output status
  set +e
  output="$(TTD_DATA_DIR="$data" TTD_SMOKE_SCRIPT="$here/$script" "$app" "$@" 2>&1)"
  status=$?
  set -e
  echo "== $label (exit $status)"
  printf '%s\n' "$output" | grep '^TTD_SMOKE_REPORT ' || printf '%s\n' "$output" | tail -n 20
  if [ "$status" -ne 0 ]; then failures=$((failures + 1)); fi
}

launch "write and save" write.js
launch "relaunch and recover" recover.js
launch "relaunch with French system language" recover.js -AppleLanguages "(fr-FR)" -AppleLocale fr_FR

if [ -f "$data/journal.sqlite" ]; then
  echo "== journal folder: $(ls "$data" | tr '\n' ' ')"
fi
if [ "$failures" -ne 0 ]; then
  echo "Native smoke check failed ($failures scenario(s))." >&2
  exit 1
fi
echo "Native smoke check passed."
