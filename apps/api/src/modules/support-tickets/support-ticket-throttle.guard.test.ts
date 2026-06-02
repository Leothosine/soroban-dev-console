import assert from "node:assert/strict";
import test from "node:test";

import { readThrottleConfig } from "./support-ticket-throttle.guard.js";

test("support ticket throttle guard can be configured through env vars", () => {
  const previousWindow = process.env.SUPPORT_TICKET_WINDOW_MS;
  const previousLimit = process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW;

  process.env.SUPPORT_TICKET_WINDOW_MS = "120000";
  process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW = "8";

  assert.deepEqual(readThrottleConfig(), {
    windowMs: 120000,
    maxCreatesPerWindow: 8,
  });

  process.env.SUPPORT_TICKET_WINDOW_MS = previousWindow;
  process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW = previousLimit;
});

test("support ticket throttle guard falls back to defaults for invalid config", () => {
  const previousWindow = process.env.SUPPORT_TICKET_WINDOW_MS;
  const previousLimit = process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW;

  process.env.SUPPORT_TICKET_WINDOW_MS = "not-a-number";
  process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW = "0";

  assert.deepEqual(readThrottleConfig(), {
    windowMs: 60000,
    maxCreatesPerWindow: 5,
  });

  process.env.SUPPORT_TICKET_WINDOW_MS = previousWindow;
  process.env.SUPPORT_TICKET_MAX_CREATES_PER_WINDOW = previousLimit;
});
