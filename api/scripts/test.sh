#!/usr/bin/env bash
# Run the Rust test suite against the ISOLATED test database.
#
# - Loads repo-root .env, then forces DATABASE_URL = TEST_DATABASE_URL so that
#   `#[sqlx::test]` creates its throwaway databases on the ephemeral test server
#   (docker-compose `postgres-test`, port 5433), never on the dev server.
# - Sources ~/.cargo/env so it works from a non-login shell too.
#
# Usage:  api/scripts/test.sh [extra cargo test args]
#   e.g.  api/scripts/test.sh -p bt-db
#         api/scripts/test.sh            # whole workspace
set -euo pipefail

# Resolve repo root from this script's location (api/scripts -> repo root).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"

# Put cargo on PATH even if invoked from a non-login shell.
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

# Load environment from .env.
set -a
# shellcheck disable=SC1091
. "$repo_root/.env"
set +a

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "error: TEST_DATABASE_URL is not set (add it to .env). See .env.example." >&2
  exit 1
fi
export DATABASE_URL="$TEST_DATABASE_URL"

echo "Running tests against test DB: $DATABASE_URL"
cd "$repo_root/api"
exec cargo test "$@"
