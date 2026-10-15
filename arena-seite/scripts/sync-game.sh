#!/bin/sh
# Kopiert den Spielcode aus dem Repository in diesen Ordner.
# Aufruf aus dem Ordner arena-seite: npm run sync
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DEST="$HERE/src/game"
SHARED="$HERE/src/shared"
mkdir -p "$SHARED" "$DEST/client"
cp "$ROOT"/shared/*.ts "$SHARED/"
for f in editor game pixelart player-sprite textures; do
  cp "$ROOT/client/src/$f.ts" "$DEST/client/"
done
echo "Spielcode nach $DEST und $SHARED kopiert."
