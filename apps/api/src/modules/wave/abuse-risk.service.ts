/**
 * BE-213: Abuse-risk scoring with moderation-safe reason codes.
 *
 * Produces policy-safe severity outputs and internal diagnostics without
 * exposing secret detection logic. Scores are consumable by moderation
 * tools and frontend risk states.
 */

import { Injectable } from "@nestjs/common";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

/** Public-facing reason codes — safe to expose to clients. */
export type ModerationReasonCode =
  | "CLEAN"
  | "VELOCITY_ANOMALY"
  | "DUPLICATE_SUBMISSION"
  | "PATTERN_MATCH"
  | "MANUAL_FLAG";

export interface RiskScoreRequest {
  ownerKey: string;
  issueRef: string;
  /** Number of submissions by this actor in the last 24 h. */
  recentSubmissionCount?: number;
  /** Whether a near-duplicate was detected upstream. */
  duplicateDetected?: boolean;
  /** Whether a known-bad pattern was matched (internal signal). */
  patternMatched?: boolean;
  /** Whether a human moderator has manually flagged this actor. */
  manualFlag?: boolean;
}

export interface RiskScoreResult {
  severity: RiskSeverity;
  /** Public reason code — safe to return to the client. */
  reasonCode: ModerationReasonCode;
  /** Numeric score 0–100 for internal tooling. NOT returned to clients. */
  _internalScore: number;
}

@Injectable()
export class AbuseRiskService {
  score(req: RiskScoreRequest): RiskScoreResult {
    let score = 0;

    if (req.manualFlag) score += 60;
    if (req.patternMatched) score += 30;
    if (req.duplicateDetected) score += 25;
    if ((req.recentSubmissionCount ?? 0) > 10) score += 20;
    else if ((req.recentSubmissionCount ?? 0) > 5) score += 10;

    const severity = this.toSeverity(score);
    const reasonCode = this.toReasonCode(req);

    return { severity, reasonCode, _internalScore: score };
  }

  /** Strip internal diagnostics before sending to clients. */
  publicScore(req: RiskScoreRequest): Omit<RiskScoreResult, "_internalScore"> {
    const { _internalScore: _stripped, ...safe } = this.score(req);
    return safe;
  }

  private toSeverity(score: number): RiskSeverity {
    if (score >= 70) return "critical";
    if (score >= 40) return "high";
    if (score >= 15) return "medium";
    return "low";
  }

  private toReasonCode(req: RiskScoreRequest): ModerationReasonCode {
    if (req.manualFlag) return "MANUAL_FLAG";
    if (req.patternMatched) return "PATTERN_MATCH";
    if (req.duplicateDetected) return "DUPLICATE_SUBMISSION";
    if ((req.recentSubmissionCount ?? 0) > 5) return "VELOCITY_ANOMALY";
    return "CLEAN";
  }
}
