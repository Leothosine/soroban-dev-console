/**
 * BE-207: Centralised eligibility service for Wave-sensitive actions.
 *
 * Enforces rules for issue claiming, appeal intake, and reward eligibility
 * in one place rather than scattering checks across handlers.
 */

import { ForbiddenException, Injectable } from "@nestjs/common";

export type WaveAction = "claim" | "appeal" | "reward";

export interface EligibilityContext {
  ownerKey: string;
  verifiedKey?: string;
  action: WaveAction;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

@Injectable()
export class EligibilityService {
  /**
   * Assert that the caller is eligible for the given Wave action.
   * Throws ForbiddenException with a structured reason if not.
   */
  assertEligible(ctx: EligibilityContext): void {
    const result = this.check(ctx);
    if (!result.eligible) {
      throw new ForbiddenException({
        code: "ELIGIBILITY_DENIED",
        action: ctx.action,
        reason: result.reason ?? "Not eligible for this action.",
      });
    }
  }

  check(ctx: EligibilityContext): EligibilityResult {
    if (!ctx.verifiedKey) {
      return { eligible: false, reason: "Verified identity required." };
    }

    // Reward eligibility requires the verified key to match the owner key
    // (same actor must have claimed and verified).
    if (ctx.action === "reward" && ctx.verifiedKey !== ctx.ownerKey) {
      return {
        eligible: false,
        reason: "Reward eligibility requires the verified key to match the owner key.",
      };
    }

    return { eligible: true };
  }
}
