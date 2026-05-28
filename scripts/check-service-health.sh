#!/usr/bin/env bash
# scripts/check-service-health.sh
# DEVOPS-207: Baseline service health check for Wave operators.
#
# Usage:
#   bash scripts/check-service-health.sh [--api-url <url>] [--timeout <seconds>]
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
#
# Environment variables (override defaults):
#   API_URL          API base URL (default: http://localhost:4000)
#   CHECK_TIMEOUT    curl timeout in seconds (default: 5)

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
API_URL="${API_URL:-http://localhost:4000}"
CHECK_TIMEOUT="${CHECK_TIMEOUT:-5}"
ERRORS=0

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass()  { echo -e "${GREEN}✅ PASS${NC}  $*"; }
fail()  { echo -e "${RED}❌ FAIL${NC}  $*"; ERRORS=$((ERRORS + 1)); }
warn()  { echo -e "${YELLOW}⚠️  WARN${NC}  $*"; }
info()  { echo -e "   ℹ️   $*"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)  API_URL="$2";      shift 2 ;;
    --timeout)  CHECK_TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Soroban DevConsole — Service Health Check"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Helper: HTTP GET with timeout ─────────────────────────────────────────────
http_get() {
  local url="$1"
  curl --silent --max-time "${CHECK_TIMEOUT}" --write-out "%{http_code}" \
       --output /tmp/sdc_health_body.json "${url}" 2>/dev/null || echo "000"
}

# ── 1. API Health Endpoint ────────────────────────────────────────────────────
echo "── 1. API Backend (${API_URL}) ──────────────────────────"
STATUS=$(http_get "${API_URL}/health")

if [[ "${STATUS}" == "200" ]]; then
  pass "API /health returned HTTP 200"
  if command -v jq &>/dev/null && [[ -s /tmp/sdc_health_body.json ]]; then
    DB_STATUS=$(jq -r '.db // "unknown"' /tmp/sdc_health_body.json 2>/dev/null)
    UPTIME=$(jq -r '.uptime // "unknown"' /tmp/sdc_health_body.json 2>/dev/null)
    info "db=${DB_STATUS}  uptime=${UPTIME}s"
    if [[ "${DB_STATUS}" != "ok" ]]; then
      fail "Database reported non-ok status: ${DB_STATUS}"
    else
      pass "Database connectivity"
    fi
  else
    warn "jq not available or empty body — skipping detailed health parse"
  fi
elif [[ "${STATUS}" == "000" ]]; then
  fail "API unreachable at ${API_URL} (connection refused or timeout)"
else
  fail "API /health returned HTTP ${STATUS}"
fi
echo ""

# ── 2. RPC Endpoint Reachability ─────────────────────────────────────────────
echo "── 2. Soroban RPC Endpoints ─────────────────────────────"

# Load from .env if present, otherwise use known defaults
ENV_FILE="apps/api/.env"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${ENV_FILE}"; set +a
fi

RPC_TESTNET="${SOROBAN_RPC_TESTNET_URL:-https://soroban-testnet.stellar.org:443}"
RPC_MAINNET="${SOROBAN_RPC_MAINNET_URL:-}"
RPC_FUTURENET="${SOROBAN_RPC_FUTURENET_URL:-}"
RPC_LOCAL="${SOROBAN_RPC_LOCAL_URL:-http://localhost:8000/soroban/rpc}"

check_rpc() {
  local name="$1"
  local url="$2"
  if [[ -z "${url}" ]]; then
    warn "${name}: not configured (skipping)"
    return
  fi
  local code
  code=$(curl --silent --max-time "${CHECK_TIMEOUT}" \
              --write-out "%{http_code}" --output /dev/null \
              --request POST "${url}" \
              --header "Content-Type: application/json" \
              --data '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}' \
              2>/dev/null || echo "000")
  if [[ "${code}" == "200" ]]; then
    pass "${name}: reachable (HTTP 200)"
  elif [[ "${code}" == "000" ]]; then
    fail "${name}: unreachable (${url})"
  else
    warn "${name}: HTTP ${code} — may be degraded (${url})"
  fi
}

check_rpc "testnet " "${RPC_TESTNET}"
check_rpc "mainnet " "${RPC_MAINNET}"
check_rpc "futurenet" "${RPC_FUTURENET}"
check_rpc "local    " "${RPC_LOCAL}"
echo ""

# ── 3. Job Queue Depth (via API) ──────────────────────────────────────────────
echo "── 3. Job Queue Depth ───────────────────────────────────"
QUEUE_STATUS=$(http_get "${API_URL}/health/queues" 2>/dev/null || echo "000")

if [[ "${QUEUE_STATUS}" == "200" ]] && command -v jq &>/dev/null; then
  DEPTH=$(jq -r '.depth // 0' /tmp/sdc_health_body.json 2>/dev/null)
  if [[ "${DEPTH}" -gt 500 ]]; then
    fail "Job queue depth is ${DEPTH} (threshold: 500)"
  elif [[ "${DEPTH}" -gt 100 ]]; then
    warn "Job queue depth is ${DEPTH} (elevated, threshold: 100)"
  else
    pass "Job queue depth: ${DEPTH}"
  fi
elif [[ "${QUEUE_STATUS}" == "404" ]]; then
  warn "/health/queues not implemented — skipping queue depth check"
else
  warn "Could not reach /health/queues (HTTP ${QUEUE_STATUS}) — skipping"
fi
echo ""

# ── 4. CI / Build Artefacts ───────────────────────────────────────────────────
echo "── 4. Local Build Artefacts ─────────────────────────────"
if [[ -d "apps/web/.next" ]]; then
  pass "apps/web/.next build directory exists"
else
  warn "apps/web/.next not found — web app may not be built"
fi

if [[ -f "apps/api/prisma/dev.db" ]] || [[ -n "${DATABASE_URL:-}" ]]; then
  pass "Database file or DATABASE_URL present"
else
  warn "No local database file found (expected apps/api/prisma/dev.db)"
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
if [[ "${ERRORS}" -eq 0 ]]; then
  echo -e "${GREEN}  ✅ All checks passed${NC}"
else
  echo -e "${RED}  ❌ ${ERRORS} check(s) failed — see output above${NC}"
fi
echo "═══════════════════════════════════════════════════════"
echo ""

exit "${ERRORS}"
