#!/usr/bin/env bash
# Brings the server up to the latest code on the deploy branch and rebuilds the shop.
# Run by hand (`~/shop/deploy/update.sh`) or by the GitHub "Deploy" workflow over SSH (docs/deploy.md §9).
#
# The whole script sits inside { … } so bash reads it completely before running: `git merge` below may
# replace this very file.
{
  set -euo pipefail

  branch="${DEPLOY_BRANCH:-main}"
  cd "$(dirname "$(readlink -f "$0")")/.."

  # One update at a time: a second push waits for the first one to finish.
  exec 9>"${TMPDIR:-/tmp}/shop-update.lock"
  flock 9

  echo "→ Fetching $branch"
  git fetch --quiet origin "$branch"
  # Only fast-forwards: a server with local changes or a rewritten branch stops here instead of guessing.
  git merge --ff-only --quiet "origin/$branch"
  echo "→ Now at $(git log -1 --format='%h %s')"

  cd deploy
  # The build reads the catalogue from the database, so it must be running first.
  docker compose up -d --wait mongo redis
  echo "→ Building and restarting (the old version keeps serving until the new one is ready)"
  docker compose up -d --build --remove-orphans --wait --wait-timeout 300
  docker compose ps --format 'table {{.Service}}\t{{.Status}}'

  # Old shop images pile up on every build; keep the disk from filling.
  docker image prune -f >/dev/null
  echo "✓ Deployed"
  exit 0
}
