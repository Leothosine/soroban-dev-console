# Observability: Dashboards and Service-Level Signals

> DEVOPS-207 — Baseline observability for Wave 5 operators.

## Overview

This document defines the baseline set of dashboards, metrics, and health signals for the Soroban DevConsole platform. It covers the API backend, web frontend, RPC proxy, and job queues so Wave 5 operators have a shared view of platform health.

## Service-Level Signals

### API Backend (`apps/api`, port 4000)

| Signal | Source | Healthy Threshold |
|--------|--------|-------------------|
| HTTP 5xx rate | Access logs / NestJS interceptor | < 1% of requests over 5 min |
| P95 response latency | Request timing middleware | < 500 ms |
| Database query time | Prisma query events | < 200 ms P95 |
| RPC proxy error rate | `apps/api/src/modules/rpc` | < 5% of proxied calls |
| Active workspace count | `GET /health` endpoint | Informational |
| Job queue depth | `apps/api/src/modules/jobs` | < 100 pending |
| Audit log write failures | `apps/api/src/modules/point-ledger` | 0 per hour |

### Web Frontend (`apps/web`, port 3000)

| Signal | Source | Healthy Threshold |
|--------|--------|-------------------|
| SSR error rate | Next.js error boundary / logs | < 0.5% of page renders |
| Core Web Vitals (LCP) | Browser RUM | < 2.5 s |
| API fetch failure rate | Client-side fetch wrapper | < 2% of calls |
| Build success | CI `web` job | 100% on `main` |

### Soroban RPC Proxy

| Signal | Source | Healthy Threshold |
|--------|--------|-------------------|
| Upstream RPC availability | `scripts/check-service-health.sh` | ≥ 1 endpoint reachable |
| Cache hit rate | RPC module cache layer | > 40% |
| Rate-limit rejections | RPC module | < 10/min per workspace |
| Failover activations | RPC module logs | Alert on any activation |

### Job Queues

| Signal | Source | Healthy Threshold |
|--------|--------|-------------------|
| Queue depth | `apps/api/src/modules/jobs` | < 100 |
| Failed job count | Job module error handler | 0 per 15 min window |
| Job processing latency | Job module timing | < 30 s P95 |

## Dashboards

### Recommended Dashboard Layout

Operators should configure their observability tool (Grafana, Datadog, CloudWatch, etc.) with the following panels:

**Row 1 — Platform Health**
- API health check status (pass/fail)
- RPC endpoint reachability (testnet / mainnet / futurenet / local)
- Active DB connections

**Row 2 — Traffic**
- HTTP request rate (req/s) by status code family (2xx, 4xx, 5xx)
- P50 / P95 / P99 API response latency
- Web SSR render rate

**Row 3 — Errors**
- API 5xx count (time series)
- RPC proxy error count (time series)
- Job failure count (time series)

**Row 4 — Queues & Background Work**
- Job queue depth
- Job processing latency histogram
- Audit log write rate

### Minimal Local Dashboard (CLI)

Run the health check script to get a quick snapshot without a full observability stack:

```bash
bash scripts/check-service-health.sh
```

The script checks:
1. API `/health` endpoint reachability
2. Database connectivity (via API health response)
3. Each configured Soroban RPC endpoint
4. Job queue depth (if API is reachable)

Exit codes:
- `0` — all checks passed
- `1` — one or more checks failed (details printed to stdout)

## Alerting Thresholds

See [docs/runbooks.md](./runbooks.md) for the full alert routing and escalation policy. The thresholds below map directly to runbook entries.

| Alert | Condition | Severity |
|-------|-----------|----------|
| API down | Health check fails 3× in 5 min | P1 |
| High 5xx rate | > 5% of requests over 10 min | P2 |
| RPC all endpoints down | All configured RPC URLs unreachable | P1 |
| Job queue backed up | Depth > 500 for > 10 min | P2 |
| DB slow queries | P95 > 1 s for > 5 min | P2 |
| Build failure on main | CI `web` or `api` job fails | P3 |

## Instrumentation Points

### API Health Endpoint

The API exposes `GET /health` (module: `apps/api/src/modules/health`). The response includes:

```json
{
  "status": "ok",
  "db": "ok",
  "rpc": { "testnet": "ok", "mainnet": "degraded" },
  "uptime": 3600
}
```

### Structured Logging

All API modules emit structured JSON logs. Key fields:

| Field | Description |
|-------|-------------|
| `level` | `info` / `warn` / `error` |
| `correlationId` | `x-request-id` header value |
| `module` | NestJS module name |
| `durationMs` | Request or operation duration |
| `statusCode` | HTTP status (request logs only) |

### RPC Correlation IDs

The RPC proxy attaches `x-request-id` to every upstream call. Use this to correlate API logs with Soroban RPC provider logs.

## Maintenance

- Review thresholds quarterly or after each Wave launch.
- Update this document when new modules are added to `apps/api/src/modules/`.
- Run `bash scripts/check-service-health.sh` as part of pre-Wave validation (`npm run wave-prep`).
