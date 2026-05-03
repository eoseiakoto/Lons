#!/usr/bin/env bash
# GraphQL server post-build health check for the Lons platform.
# Starts the built GraphQL server, waits for it to become ready,
# runs an introspection query, and validates the response.
#
# Requirements:
#   - The graphql-server must already be built (pnpm build)
#   - DATABASE_URL and REDIS_URL environment variables must be set
#   - curl and node must be available on PATH
#
# Usage: ./scripts/graphql-health-check.sh
# Exit codes: 0 = success, 1 = failure

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT="${GRAPHQL_PORT:-3000}"
GRAPHQL_URL="http://localhost:${PORT}/graphql"
MAX_WAIT="${GRAPHQL_HEALTH_TIMEOUT:-60}"   # seconds
POLL_INTERVAL=2                            # seconds between retries

# ---------------------------------------------------------------------------
# Cleanup: kill the background server on exit regardless of outcome
# ---------------------------------------------------------------------------
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[health-check] Stopping GraphQL server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Start the GraphQL server in the background
# ---------------------------------------------------------------------------
echo "[health-check] Starting GraphQL server on port ${PORT}..."
NODE_ENV=development node apps/graphql-server/dist/main.js &
SERVER_PID=$!

# Give the process a moment, then verify it is still alive
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "[health-check] ERROR: GraphQL server exited immediately."
  exit 1
fi

# ---------------------------------------------------------------------------
# Wait for the server to accept connections
# ---------------------------------------------------------------------------
echo "[health-check] Waiting up to ${MAX_WAIT}s for server to be ready..."
ELAPSED=0
while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  # A lightweight POST to the GraphQL endpoint
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$GRAPHQL_URL" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ __typename }"}' \
    --max-time 5 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "[health-check] Server is ready (HTTP ${HTTP_CODE}) after ${ELAPSED}s."
    break
  fi

  # Check the server process is still running
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[health-check] ERROR: GraphQL server process died while waiting."
    exit 1
  fi

  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
  echo "[health-check] ERROR: Server did not become ready within ${MAX_WAIT}s."
  exit 1
fi

# ---------------------------------------------------------------------------
# Run the introspection query
# ---------------------------------------------------------------------------
echo "[health-check] Sending introspection query..."
RESPONSE=$(curl -s -X POST "$GRAPHQL_URL" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}' \
  --max-time 15 2>/dev/null || echo "")

if [ -z "$RESPONSE" ]; then
  echo "[health-check] ERROR: Empty response from introspection query."
  exit 1
fi

# ---------------------------------------------------------------------------
# Validate the response
# ---------------------------------------------------------------------------
echo "[health-check] Validating response..."

# 1. Must be valid JSON
if ! echo "$RESPONSE" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const json = JSON.parse(Buffer.concat(chunks).toString());
      // 2. Must not contain a top-level 'errors' array
      if (json.errors && json.errors.length > 0) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
        process.exit(1);
      }
      // 3. Must contain data.__schema.types
      if (!json.data || !json.data.__schema || !Array.isArray(json.data.__schema.types)) {
        console.error('Missing data.__schema.types in response');
        process.exit(1);
      }
      const typeNames = json.data.__schema.types.map(t => t.name);
      // 4. Schema must contain at least the built-in Query type
      if (!typeNames.includes('Query')) {
        console.error('Schema does not contain a Query type');
        process.exit(1);
      }
      console.log('Schema contains ' + typeNames.length + ' types (including Query).');
      process.exit(0);
    } catch (e) {
      console.error('Invalid JSON:', e.message);
      process.exit(1);
    }
  });
" 2>&1; then
  echo "[health-check] ERROR: Response validation failed."
  echo "[health-check] Raw response (first 500 chars): ${RESPONSE:0:500}"
  exit 1
fi

echo "[health-check] GraphQL health check passed."
exit 0
