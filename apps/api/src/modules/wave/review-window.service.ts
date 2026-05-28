/**
 * BE-211: Review-window and appeal-timing policy enforcement.
 *
 * Defines when maintainers still have a fair chance to review naturally
 * and when automated evaluation may begin. Exposes schedule data to the UI.
 */

import { BadRequestException, Injectable } from "@nestjs/common";

export interface ReviewWindowPolicy {
  /** Minimum hours a maintainer has to review before automated evaluation starts. */
  maintainerReviewWindowHours: number;
  /** Maximum hours after submission that an appeal may be opened. */
  appealDeadlineHours: number;
  /** Maximum hours an appeal may remain open before auto-resolution. */
  appealMaxOpenHours: number;
}

export interface ReviewSchedule {
  submittedAt: string;
  maintainerReviewDeadline: string;
  automatedEvalEligibleAt: string;
  appealDeadline: string;
  policy: ReviewWindowPolicy;
}

export interface AppealTimingResult {
  withinWindow: boolean;
  reason?: string;
  appealDeadline: string;
}

const DEFAULT_POLICY: ReviewWindowPolicy = {
  maintainerReviewWindowHours: 72,
  appealDeadlineHours: 168, // 7 days
  appealMaxOpenHours: 336,  // 14 days
};

@Injectable()
export class ReviewWindowService {
  private readonly policy: ReviewWindowPolicy = DEFAULT_POLICY;

  getPolicy(): ReviewWindowPolicy {
    return { ...this.policy };
  }

  /**
   * Compute the full review schedule for a submission.
   */
  getSchedule(submittedAt: Date): ReviewSchedule {
    const maintainerDeadline = this.addHours(submittedAt, this.policy.maintainerReviewWindowHours);
    const autoEvalEligible = maintainerDeadline;
    const appealDeadline = this.addHours(submittedAt, this.policy.appealDeadlineHours);

    return {
      submittedAt: submittedAt.toISOString(),
      maintainerReviewDeadline: maintainerDeadline.toISOString(),
      automatedEvalEligibleAt: autoEvalEligible.toISOString(),
      appealDeadline: appealDeadline.toISOString(),
      policy: this.getPolicy(),
    };
  }

  /**
   * Check whether an appeal may still be opened for a submission.
   */
  checkAppealTiming(submittedAt: Date, now: Date = new Date()): AppealTimingResult {
    const appealDeadline = this.addHours(submittedAt, this.policy.appealDeadlineHours);
    const withinWindow = now <= appealDeadline;

    return {
      withinWindow,
      reason: withinWindow
        ? undefined
        : `Appeal window closed. Deadline was ${appealDeadline.toISOString()}.`,
      appealDeadline: appealDeadline.toISOString(),
    };
  }

  /**
   * Assert that an appeal may still be opened; throws BadRequestException if not.
   */
  assertAppealAllowed(submittedAt: Date, now: Date = new Date()): void {
    const result = this.checkAppealTiming(submittedAt, now);
    if (!result.withinWindow) {
      throw new BadRequestException({
        code: "APPEAL_WINDOW_CLOSED",
        reason: result.reason,
        appealDeadline: result.appealDeadline,
      });
    }
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }
}
