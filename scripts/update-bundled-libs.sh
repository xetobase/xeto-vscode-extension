#!/bin/bash
# Update bundled xetolibs from the xeto repo.
# Run this before publishing a new extension version.
#
# The xeto repo builds flat files (lib/xeto/{name}.xetolib), but the
# extension's loadBundledLibs expects one subdirectory per lib
# (bundled-libs/{name}/{name}.xetolib), so this script creates that layout.
#
# Usage: ./scripts/update-bundled-libs.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"
XETO_LIB_DIR="$EXT_DIR/../xeto/lib/xeto"

if [ ! -d "$XETO_LIB_DIR" ]; then
  echo "Error: xeto/lib/xeto/ not found at $XETO_LIB_DIR"
  echo "Make sure the xeto repo is checked out alongside this extension."
  exit 1
fi

COUNT=$(find "$XETO_LIB_DIR" -maxdepth 1 -name "*.xetolib" | wc -l | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "Error: no .xetolib files in $XETO_LIB_DIR (has the xeto repo been built?)"
  exit 1
fi

rm -rf "$EXT_DIR/bundled-libs"
mkdir -p "$EXT_DIR/bundled-libs"

for lib in "$XETO_LIB_DIR"/*.xetolib; do
  name="$(basename "$lib" .xetolib)"
  mkdir -p "$EXT_DIR/bundled-libs/$name"
  cp "$lib" "$EXT_DIR/bundled-libs/$name/"
done

SIZE=$(du -sh "$EXT_DIR/bundled-libs" | cut -f1)
echo "Bundled $COUNT xetolibs ($SIZE) into bundled-libs/"
