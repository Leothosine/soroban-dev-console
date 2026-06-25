# Alert Routing, Escalation Policies, and Operator Runbooks

> DEVOPS-208 — Turning monitoring outputs into actionable operations.

## Alert Severity Levels

| Severity | Response SLA | Who is paged | Examples |
|----------|-------------|--------------|---------|
| **P1 — Critical** | 15 min | On-call maintainer (immediate) | API down, all RPC endpoints unreachable |
| **P2 — High** | 1 hour | On-call maintainer | High 5xx rate, job queue backed up, DB slow |
| **P3 — Medium** | Next business day | Team channel notification | Build failure on main, single RPC endpoint degraded |
| **P4 — Low** | Weekly review | Ticket created | Elevated latency within SLO, minor drift |

## Alert Routing

### Routing Rules

```
IF severity == P1 OR P2:
  → page on-call maintainer (PagerDuty / OpsGenie / GitHub @mention)
  → post to #incidents channel

IF severity == P3:
  → post to #alerts channel
  → create GitHub issue with label "incident"

IF severity == P4:
  → log to #monitoring channel
  → add to weekly review queue
```

### Ownership Matrix

| Service Area | Primary Owner | Escalation |
|-------------|---------------|------------|
| API Backend | On-call maintainer | Repo maintainer (@Ibinola) |
| Web Frontend | On-call maintainer | Repo maintainer (@Ibinola) |
| RPC Proxy | On-call maintainer | Stellar Discord #dev-support |
| CI / Workflows | On-call maintainer | Repo maintainer (@Ibinola) |
| Database | On-call maintainer | Repo maintainer (@Ibinola) |

### Escalation Policy

1. **Alert fires** → automated notification sent to on-call.
2. **+15 min, no acknowledgement** → escalate to secondary on-call.
3. **+30 min, no acknowledgement** → escalate to repo maintainer.
4. **+1 hour, unresolved P1** → post public status update in GitHub Discussions.

---

## Runbooks

### RB-001: API Unreachable (P1)

**Trigger:** `GET /health` fails 3× in 5 minutes.

**Diagnosis:**
```bash
# 1. Check if the process is running
curl -s http://localhost:4000/health

# 2. Check recent logs
# (adjust for your deployment — Docker, PM2, systemd, etc.)
# Docker:  docker logs <container> --tail 100
# PM2:     pm2 logs api --lines 100
# systemd: journalctl -u soroban-api -n 100

# 3. Run the health check script
bash scripts/check-service-health.sh
```

**Resolution steps:**
1. If process is not running → restart it.
2. If process is running but returning 5xx → check DB connectivity (see RB-003).
3. If DB is fine → check for OOM or resource exhaustion; restart if needed.
4. If restart does not resolve → roll back to the previous deployment.

**Post-incident:** Create a GitHub issue tagged `incident` with timeline and root cause.

---

### RB-002: High 5xx Error Rate (P2)

**Trigger:** > 5% of API requests return 5xx over a 10-minute window.

**Diagnosis:**
```bash
# Check recent error logs for patterns
bash scripts/check-service-health.sh

# Look for repeated error messages in API logs
# Filter for level=error in structured JSON logs
```

**Resolution steps:**
1. Identify the failing endpoint from logs (`module`, `path` fields).
2. Check if the error is DB-related → see RB-003.
3. Check if the error is RPC-related → see RB-004.
4. If a recent deployment is suspected → roll back.
5. If the issue is intermittent → add to P3 queue for investigation.

---

### RB-003: Database Connectivity / Slow Queries (P2)

**Trigger:** `db` field in `/health` response is not `"ok"`, or P95 query time > 1 s.

**Diagnosis:**
```bash
# Check DB file exists and is not corrupted
ls -lh apps/api/prisma/dev.db

# Run Prisma introspect to verify schema
cd apps/api && npx prisma db pull --print

# Check for locked tables (SQLite)
# A long-running transaction can block all writes
```

**Resolution steps:**
1. If DB file is missing → restore from backup (see `docs/backup-restore-drill.md`).
2. If DB is locked → identify and kill the blocking process; restart API.
3. If schema drift → run `npx prisma migrate deploy` in `apps/api`.
4. If performance issue → run `VACUUM` on the SQLite file during low-traffic window.

---

### RB-004: All RPC Endpoints Unreachable (P1)

**Trigger:** All configured Soroban RPC URLs fail reachability check.

**Diagnosis:**
```bash
bash scripts/check-service-health.sh

# Manual check for each endpoint
curl -s --max-time 5 \
  -X POST https://soroban-testnet.stellar.org:443 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}'
```

**Resolution steps:**
1. Check [Stellar Status Page](https://status.stellar.org) for network incidents.
2. If Stellar network is down → inform users; no action required on our side.
3. If only one endpoint is down → verify `SOROBAN_RPC_*_URL` env vars are correct.
4. If a custom/private RPC is down → contact the RPC provider.
5. Ensure at least one fallback endpoint is configured in `apps/api/.env`.

---

### RB-005: Job Queue Backed Up (P2)

**Trigger:** Job queue depth > 500 for more than 10 minutes.

**Diagnosis:**
```bash
# Check queue depth via health endpoint
curl -s http://localhost:4000/health/queues | jq .

# Check for failed jobs in API logs
# Look for level=error in jobs module logs
```

**Resolution steps:**
1. Check if the job worker is running (it may have crashed silently).
2. Restart the API to reset the worker.
3. If jobs are failing repeatedly → check the error message and fix the underlying cause.
4. If queue is backed up due to a spike → monitor; it should drain automatically.
5. If jobs are stuck (not processing) → clear the queue and re-enqueue if safe.

---

### RB-006: CI Build Failure on `main` (P3)

**Trigger:** CI `web` or `api` job fails on a push to `main`.

**Diagnosis:**
```bash
# Check the failing job in GitHub Actions
# https://github.com/Ibinola/soroban-dev-console/actions

# Reproduce locally
npm ci
npm run lint -w web
npm run typecheck -w web
npm run test:run -w web
```

**Resolution steps:**
1. Identify the failing step from the CI log.
2. If lint/typecheck → fix the code issue and push a fix commit.
3. If test failure → investigate the test; fix or quarantine if flaky (see `docs/flaky-check-quarantine.md`).
4. If dependency issue → run `npm ci` locally and check for resolution errors.
5. Do not merge PRs while `main` is broken.

---

### RB-007: Single RPC Endpoint Degraded (P3)

**Trigger:** One RPC endpoint returns non-200 or times out; others are healthy.

**Resolution steps:**
1. Check [Stellar Status Page](https://status.stellar.org).
2. If the endpoint is a third-party provider → check their status page.
3. Update `SOROBAN_RPC_*_URL` to point to an alternative if available.
4. The RPC proxy will automatically use remaining healthy endpoints.
5. Monitor for recovery; no immediate user impact if ≥ 1 endpoint is healthy.

---

### RB-008: Auth Incident — Owner Key Compromise (P1)

**Trigger:** Suspicious activity detected on a workspace, or owner key reported as compromised.

**Diagnosis:**
1. Check audit logs for the affected workspace: `audit_logs` table filtered by `resourceId`.
2. Look for repeated `UnauthorizedException` patterns from `owner-key.guard.ts`.
3. Verify if the key matches common patterns (short, whitespace, or forbidden).

**Resolution:**
1. Immediately revoke the compromised key by generating a new owner key.
2. Update the workspace record with the new key hash.
3. Review audit logs for any unauthorized mutations.
4. If data was tampered with, restore from the most recent backup.
5. File a post-incident report with timeline and affected resources.

**Prevention:**
- Enforce minimum key length of 16 characters in production.
- Enable key rotation every 90 days.
- Monitor for brute-force patterns via rate-limit service.

---

### RB-009: Webhook Security Incident (P1)

**Trigger:** Repeated webhook signature failures, or a webhook replay attack detected.

**Diagnosis:**
1. Check webhook signature logs for `UnauthorizedException` messages.
2. Verify the `WEBHOOK_SECRET` has not been rotated without notice.
3. Check `webhook-replay.service.ts` for duplicate webhook IDs.

**Resolution:**
1. If webhook secret was rotated → coordinate with the provider for the new secret.
2. If replay attack detected → revoke the affected webhook ID and regenerate.
3. Review recent webhook deliveries for any unauthorized actions.
4. Update the webhook endpoint to enforce strict replay protection.
5. Rotate the webhook secret if there is any sign of compromise.

**Prevention:**
- Use unique webhook IDs for each delivery event.
- Set up webhook secret rotation schedule.
- Monitor webhook failure rate alerts.

---

### RB-010: Supply-Chain Build Input Compromise (P1)

**Trigger:** Build manifest hash mismatch or unexpected build input modification.

**Diagnosis:**
1. Compare `build-manifest.json` hashes against the actual file contents.
2. Check git history for unauthorized changes to build input files.
3. Verify CI pipeline integrity for tampered steps.

**Resolution:**
1. If manifest mismatch detected → identify which files were modified.
2. Revert unauthorized changes to build inputs.
3. Regenerate the build manifest with correct hashes.
4. Review CI job logs for signs of pipeline tampering.
5. Consider rebuilding from a known-good commit.

**Prevention:**
- All build inputs must be tracked in the build manifest.
- CI must verify manifest integrity before proceeding with builds.
- Restrict write access to build configuration files.

---

### RB-011: Rate Limit Abuse or DoS Attempt (P2)

**Trigger:** A single client triggers repeated rate limit violations across multiple endpoints.

**Diagnosis:**
1. Check rate-limit service logs for repeated `TOO_MANY_REQUESTS` from the same identifier.
2. Identify the affected endpoints and time windows.
3. Check if the traffic pattern is organic (bot) or targeted (DoS).

**Resolution:**
1. Block the offending IP or key at the infrastructure level (WAF / firewall).
2. If legitimate traffic is being rate-limited, adjust the `THROTTLE_POLICIES` config.
3. For DoS patterns, engage DDoS protection (Cloudflare, AWS Shield).
4. Review and tighten rate limits on the most abuse-prone endpoints.

**Prevention:**
- Tiered rate limiting: stricter limits for auth/creation endpoints.
- Use IP-based + user-based rate limiting simultaneously.
- Monitor for rate limit violation patterns in dashboards.

---

## Post-Incident Process

After any P1 or P2 incident:

1. **Timeline** — document when the alert fired, when it was acknowledged, and when it was resolved.
2. **Root cause** — identify what caused the incident.
3. **Impact** — estimate affected users / requests.
4. **Action items** — create GitHub issues for any follow-up work.
5. **Runbook update** — if this runbook was missing a step, update it.

File the post-incident report as a GitHub issue with labels `incident` and `post-mortem`.
