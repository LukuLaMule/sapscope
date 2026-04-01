#!/usr/bin/env bash
# Build agent distribution tarball served at /dist/agent.tar.gz
# Run from the sapscope project root before deploying or after updating the agent.

set -euo pipefail

DIST_DIR="frontend/dist"
TARBALL="$DIST_DIR/agent.tar.gz"

mkdir -p "$DIST_DIR"

tar czf "$TARBALL" \
  --transform 's|^agent/||' \
  agent/

sha256sum "$TARBALL" | awk '{print $1}' > "${TARBALL}.sha256"

echo "Built: $TARBALL  ($(du -sh "$TARBALL" | cut -f1))"
echo "SHA256: $(cat "${TARBALL}.sha256")"
