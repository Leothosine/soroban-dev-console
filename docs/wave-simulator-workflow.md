# Local Wave Simulator Workflow

## Overview

The Wave Simulator seeds realistic operational scenarios into your local database, allowing you to reproduce and debug edge cases without needing live production data.

## Quick Start

```bash
# Ensure the database is initialized
cd apps/api && npx prisma db push && npx prisma db seed && cd ../..

# Run the full-wave scenario (default)
npx tsx scripts/wave-simulator.ts

# List available scenarios
npx tsx scripts/wave-simulator.ts --list

# Run a specific scenario
npx tsx scripts/wave-simulator.ts --scenario budget-pressure

# Point at a different database
npx tsx scripts/wave-simulator.ts --scenario appeal-backlog --db ./apps/api/demo.db
```

## Available Scenarios

| Scenario | Description |
|----------|-------------|
| `budget-pressure` | Repo budget near exhaustion (85/100 pts used) with 3 active reservations |
| `verification-blocked` | 5 contributors with pending verification, 2 with rejected status |
| `appeal-backlog` | 10 open appeals, oldest submitted 7 days ago |
| `full-wave` | All scenarios combined |

## Inspecting Seeded Data

After running the simulator, inspect the seeded records:

```bash
npx tsx scripts/explore-seed-data.ts --table budget_scopes
npx tsx scripts/explore-seed-data.ts --table contributor_verifications
npx tsx scripts/explore-seed-data.ts --table appeal_cases
```

## Requirements

- Local SQLite database initialized with `npx prisma db push`
- `better-sqlite3` package installed (`npm install better-sqlite3`)
- Wave 5 migrations applied (included in `prisma db push`)
