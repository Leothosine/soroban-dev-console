/**
 * AI-208: Shadow-mode scoring for AI appeal review logic.
 *
 * Runs candidate model logic against live-like appeal traffic without
 * producing any side-effects (no DB writes, no notifications, no state changes).
 * Results are logged so they can be compared against the live model's decisions
 * to judge a candidate safely before promotion.
 *
 * Explicit inputs  → scoreShadow(request, scorerFn)
 * Explicit outputs → ShadowScoreResult (score, band, diverged, latencyMs)
 * Review boundary  → ShadowScoreResult.diverged=true surfaces cases where the
 *                    candidate disagrees with the live model; humans inspect these.
 */

import { Injectable, Logger } from "@nestjs/common";

export interface ShadowScoreRequest {
  appealId: string;
  contributorId: string;
  issueRef: string;
  /** Raw score produced by the currently-live model (0–1). */
  liveScore: number;
  /** Any additional feature payload the candidate model needs. */
  features: Record<string, unknown>;
}

export interface ShadowScoreResult {
  appealId: string;
  /** Score produced by the candidate model (0–1). */
  candidateScore: number;
  /** Score produced by the live model for comparison. */
  liveScore: number;
  /** True when the two scores fall into different policy bands. */
  diverged: boolean;
  /** Absolute difference between candidate and live scores. */
  delta: number;
  latencyMs: number;
  scoredAt: string;
}

/** A scorer function signature — the candidate logic to evaluate in shadow. */
export type CandidateScorerFn = (
  features: Record<string, unknown>,
) => number | Promise<number>;

/** Band boundaries used to detect meaningful divergence (mirrors calibration defaults). */
const APPROVE_THRESHOLD = 0.8;
const REJECT_THRESHOLD = 0.25;

function toBand(score: number): "approve" | "review" | "reject" {
  if (score >= APPROVE_THRESHOLD) return "approve";
  if (score <= REJECT_THRESHOLD) return "reject";
  return "review";
}

@Injectable()
export class ShadowModeService {
  private readonly logger = new Logger(ShadowModeService.name);

  /**
   * Run the candidate scorer in shadow mode.
   * Never throws — errors in the candidate are caught and logged so the live
   * path is never disrupted.
   *
   * @returns ShadowScoreResult, or null if the candidate itself errored.
   */
  async scoreShadow(
    request: ShadowScoreRequest,
    candidateScorer: CandidateScorerFn,
  ): Promise<ShadowScoreResult | null> {
    const start = Date.now();

    let candidateScore: number;
    try {
      candidateScore = await Promise.resolve(candidateScorer(request.features));
      // Clamp to [0, 1]
      candidateScore = Math.min(1, Math.max(0, candidateScore));
    } catch (err) {
      this.logger.warn(
        `shadow-mode scorer error for appeal ${request.appealId}: ${(err as Error).message}`,
      );
      return null;
    }

    const latencyMs = Date.now() - start;
    const delta = Math.abs(candidateScore - request.liveScore);
    const diverged = toBand(candidateScore) !== toBand(request.liveScore);

    const result: ShadowScoreResult = {
      appealId: request.appealId,
      candidateScore,
      liveScore: request.liveScore,
      diverged,
      delta,
      latencyMs,
      scoredAt: new Date().toISOString(),
    };

    // Emit as a structured log line for offline analysis / metric pipelines.
    this.logger.log(
      JSON.stringify({
        event: "shadow_score",
        ...result,
      }),
    );

    if (diverged) {
      this.logger.warn(
        `shadow divergence on appeal ${request.appealId}: live=${request.liveScore.toFixed(3)} candidate=${candidateScore.toFixed(3)}`,
      );
    }

    return result;
  }
}
