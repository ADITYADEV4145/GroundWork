#!/bin/sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo 'Groundwork requires Node.js >=22. Install it with: brew install node' >&2
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo 'Groundwork requires Node.js >=22. Upgrade with: brew install node' >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo 'Groundwork requires npm. Install Node.js and npm with: brew install node' >&2
  exit 1
fi

package=${GW_PACKAGE:-groundwork-agent@${GW_VERSION:-latest}}
npm install --global "$package"
gw --version
