#!/bin/bash

set -euo pipefail

SCRIPT_PATH=$(dirname "$0")
cd "$SCRIPT_PATH"

if [ -z "${1:-}" ] || [ ! -f "$1" ]; then
    echo "Provide a path to an existing project manifest, e.g. polkadot-ah.yaml" >&2
    exit 1
fi

export PROJECT_PATH="$1"

yarn install --immutable
yarn codegen
yarn build
yarn start:docker
