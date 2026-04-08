#!/bin/bash
# Update bundled xetolibs from the xeto repo.
# Run this before publishing a new extension version.
#
# Usage: ./scripts/update-bundled-libs.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"
XETO_LIB_DIR="$EXT_DIR/../../xeto/lib/xeto"

if [ ! -d "$XETO_LIB_DIR" ]; then
  echo "Error: xeto/lib/xeto/ not found at $XETO_LIB_DIR"
  echo "Make sure the xeto repo is checked out alongside this extension."
  exit 1
fi

rm -rf "$EXT_DIR/bundled-libs"
cp -r "$XETO_LIB_DIR" "$EXT_DIR/bundled-libs"

COUNT=$(find "$EXT_DIR/bundled-libs" -name "*.xetolib" | wc -l | tr -d ' ')
SIZE=$(du -sh "$EXT_DIR/bundled-libs" | cut -f1)

echo "Bundled $COUNT xetolibs ($SIZE) into bundled-libs/"
