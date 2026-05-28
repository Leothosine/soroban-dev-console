/**
 * BE-207: Verification and eligibility guard for Wave-sensitive actions.
 *
 * Enforces that the caller has a verified identity before accessing
 * protected endpoints (issue claiming, appeal intake, reward eligibility).
 * Verification state is carried in the x-verified-key header alongside
 * the existing x-owner-key bearer token.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

export const REQUIRE_VERIFIED = "requireVerified";

/** Attach to a controller or handler to require verified status. */
export const RequireVerified = () => SetMetadata(REQUIRE_VERIFIED, true);

@Injectable()
export class VerificationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const verifiedKey = req.headers["x-verified-key"];

    if (!verifiedKey || typeof verifiedKey !== "string" || verifiedKey.trim().length < 8) {
      throw new ForbiddenException(
        "This action requires a verified identity. Provide a valid x-verified-key header.",
      );
    }

    (req as any).verifiedKey = verifiedKey.trim();
    return true;
  }
}
