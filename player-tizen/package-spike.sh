#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
PROFILE="${TIZEN_PROFILE:-}"
PROFILES_XML="${TIZEN_PROFILES_XML:-}"
TARGET="${TIZEN_TARGET:-}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "Install Tizen Studio with the Samsung TV extension and add <TIZEN_STUDIO>/tools/ide/bin to PATH." >&2
    exit 127
  fi
}

need node
need tizen

cd "$ROOT"

echo "== Generate package icon =="
node "$REPO_ROOT/scripts/generate-player-icons.js"

echo "== Tizen CLI =="
tizen version || true

if [ -n "$PROFILES_XML" ]; then
  echo "== Configure signing profile path =="
  tizen cli-config -g "default.profiles.path=$PROFILES_XML"
fi

echo "== Security profiles =="
tizen security-profiles list || true

echo "== Clean previous package output =="
find . -maxdepth 1 -name '*.wgt' -delete

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/zigns-tizen-package.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cp config.xml index.html icon.png "$STAGE/"

echo "== Build web project =="
tizen build-web -- "$STAGE"

echo "== Package .wgt =="
package_args=(-t wgt)
if [ -n "$PROFILE" ]; then
  package_args+=(-s "$PROFILE")
else
  echo "TIZEN_PROFILE is not set; Tizen CLI will use the active/default profile if one exists."
fi
package_args+=(-- "$STAGE/.buildResult")
tizen package "${package_args[@]}"

WGT="$(find "$STAGE" "$STAGE/.buildResult" -maxdepth 1 -name '*.wgt' -type f -printf '%T@ %p\n' | sort -nr | awk 'NR==1 {print $2}')"
if [ -z "$WGT" ]; then
  echo "Package completed but no .wgt was found under the staged build directory." >&2
  exit 1
fi
FINAL_WGT="$ROOT/$(basename "$WGT")"
mv "$WGT" "$FINAL_WGT"
echo "Built: $FINAL_WGT"

if [ -n "$TARGET" ]; then
  echo "== Install on target: $TARGET =="
  if command -v sdb >/dev/null 2>&1; then sdb devices; fi
  tizen install -n "$FINAL_WGT" -t "$TARGET"
else
  echo "Set TIZEN_TARGET=<device-name> to install after packaging."
fi
