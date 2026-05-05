#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
TARGET="${WEBOS_DEVICE:-}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "Install the LG webOS TV SDK/CLI and add the CLI bin directory to PATH." >&2
    exit 127
  fi
}

need node
need ares-package

cd "$REPO_ROOT"

echo "== Generate package icons =="
node scripts/generate-player-icons.js

cd "$ROOT"

echo "== webOS CLI =="
ares-package --version || true

echo "== Clean previous package output =="
find . -maxdepth 1 -name '*.ipk' -delete

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/zigns-webos-package.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cp appinfo.json index.html icon.png largeicon.png "$STAGE/"

echo "== Package .ipk =="
ares-package -o "$ROOT" "$STAGE"

IPK="$(find "$ROOT" -maxdepth 1 -name '*.ipk' -type f -printf '%T@ %p\n' | sort -nr | awk 'NR==1 {print $2}')"
if [ -z "$IPK" ]; then
  echo "Package completed but no .ipk was found under $ROOT." >&2
  exit 1
fi
echo "Built: $IPK"

if [ -n "$TARGET" ]; then
  need ares-install
  need ares-launch
  echo "== Install and launch on target: $TARGET =="
  ares-install --device "$TARGET" "$IPK"
  ares-launch --device "$TARGET" io.zigns.player
else
  echo "Set WEBOS_DEVICE=<device-name> to install and launch after packaging."
  echo "Use ares-setup-device to create the device profile."
fi
