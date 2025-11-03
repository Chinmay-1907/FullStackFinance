#!/bin/sh
# Minimal Husky helper script to ensure required tooling exists.
command -v pnpm >/dev/null 2>&1 || {
  echo "pnpm is required to run Husky hooks." >&2
  exit 1
}
