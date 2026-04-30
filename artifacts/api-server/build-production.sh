#!/bin/sh
set -e

echo "=== Installing Python dependencies ==="
pip install -r artifacts/backend-py/requirements.txt --quiet

echo "=== Building Node.js server ==="
pnpm --filter @workspace/api-server run build

echo "=== Build complete ==="
