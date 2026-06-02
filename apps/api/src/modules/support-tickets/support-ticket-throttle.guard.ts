/**
 * INFRA-210: Backpressure guard for the support-tickets endpoint.
 *
 * Limits ticket creation per owner key to MAX_CREATES_PER_WINDOW submissions
 * within WINDOW_MS. Applies only to POST (creation); reads are unrestricted.
 * Returns 429 with a Retry-After header when the limit is exceeded.
 */

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_CREATES_PER_WINDOW = 5; // max new tickets per owner key per window

export function readThrottleConfig() {
  const parsedWindow = Number.parseInt(
    process.env.SUPPORT_TICKET_WINDOW_MS ?? "",
    10,
  );
  const parsedLimit = Number.parseInt(
    process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW ?? "",
    10,
  );

  return {
    windowMs:
      Number.isFinite(parsedWindow) && parsedWindow > 0
        ? parsedWindow
        : DEFAULT_WINDOW_MS,
    maxCreatesPerWindow:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : DEFAULT_MAX_CREATES_PER_WINDOW,
  };
}

type Bucket = { count: number; resetAt: number };

@Injectable()
export class SupportTicketThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { ownerKey?: string }>();
    const { windowMs, maxCreatesPerWindow } = readThrottleConfig();

    // Only throttle creation requests
    if (req.method !== "POST") return true;

    const key = req.ownerKey ?? req.ip ?? "unknown";
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (bucket.count >= maxCreatesPerWindow) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      http.getResponse<Response>().setHeader("Retry-After", String(retryAfter));
      throw new HttpException(
        "Too many support ticket submissions — please wait before trying again",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }
}
