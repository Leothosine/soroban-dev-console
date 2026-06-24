# AI-208: Shadow Mode for AI Appeal Review Logic

## Overview

`ShadowModeService` provides a safe path for evaluating candidate model changes
against live-like appeal traffic without affecting any outcomes. The candidate
scorer runs in a fire-and-observe loop: results are logged, never acted on.

## How it works

```
live appeal request
      │
      ├─► live scorer  ─► outcome applied (DB write, notification, etc.)
      │
      └─► ShadowModeService.scoreShadow(request, candidateScorer)
                │
                ├─► candidate scorer runs (errors caught; live path unaffected)
                ├─► result logged as structured JSON  { event: "shadow_score", … }
                └─► diverged=true logged as WARN if bands differ
```

## Explicit Inputs / Outputs

| Direction | What it is |
|-----------|-----------|
| **Input** | `ShadowScoreRequest.liveScore` — current model's score |
| **Input** | `ShadowScoreRequest.features` — feature payload forwarded to candidate |
| **Input** | `candidateScorer: CandidateScorerFn` — the new logic under test |
| **Output** | `ShadowScoreResult.candidateScore` — what the candidate would have scored |
| **Output** | `ShadowScoreResult.diverged` — true when bands differ (human review signal) |
| **Output** | `ShadowScoreResult.delta` — magnitude of score difference |

## Review Boundary

`diverged=true` means the candidate places the appeal in a different policy band
than the live model. These cases must be inspected by a maintainer before the
candidate is promoted.

**The shadow path never writes to the database, sends notifications, or changes
appeal state.** It is safe to run on any live traffic.

## Promotion Checklist

Before promoting a candidate to production:

1. Run shadow mode for ≥ 48 hours of live traffic.
2. Review all `diverged=true` log lines — confirm the candidate's band is correct.
3. Check P95 `latencyMs` is acceptable.
4. Record findings as a comment on the AI-208 issue before merging.

## File Location

`apps/api/src/modules/appeal-decisions/shadow-mode.service.ts`
