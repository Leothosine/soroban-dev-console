/**
 * QA-203: Appeal intake, status transitions, and AI decision recording tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AppealDecisionsService } from "./modules/appeal-decisions/appeal-decisions.service.js";
import { AppealService } from "./modules/wave/appeal.service.js";

function createAppealService(prisma: Record<string, unknown>) {
  const audit = { log: async () => {} };
  return new AppealService(prisma as never, audit as never);
}

test("AppealService.create: opens a new appeal case", async () => {
  const created = {
    id: "apl-1",
    ownerKey: "owner-key-12345678",
    issueRef: "42",
    reason: "Review was incorrect",
    status: "open",
  };
  const prisma = {
    appealCase: {
      findFirst: async () => null,
      create: async () => created,
    },
  };
  const service = createAppealService(prisma);
  const result = await service.create("owner-key-12345678", {
    issueRef: "42",
    reason: "Review was incorrect",
    evidenceJson: { urls: ["https://github.com/example/pr/1"] },
  });
  assert.equal(result.id, "apl-1");
  assert.equal(result.status, "open");
});

test("AppealService.create: rejects duplicate active appeals for the same issue", async () => {
  const prisma = {
    appealCase: {
      findFirst: async () => ({
        id: "existing",
        issueRef: "42",
        status: "open",
      }),
    },
  };
  const service = createAppealService(prisma);
  await assert.rejects(
    () =>
      service.create("owner-key-12345678", {
        issueRef: "42",
        reason: "Second attempt",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /active appeal/i);
      return true;
    },
  );
});

test("AppealService.create: requires issueRef and reason", async () => {
  const prisma = { appealCase: { findFirst: async () => null } };
  const service = createAppealService(prisma);

  await assert.rejects(
    () => service.create("owner-key-12345678", { issueRef: "  ", reason: "x" }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.create("owner-key-12345678", { issueRef: "42", reason: "  " }),
    BadRequestException,
  );
});

test("AppealService.transition: open → under_review", async () => {
  const existing = {
    id: "apl-1",
    ownerKey: "owner-key-12345678",
    status: "open",
  };
  let updatedStatus = "";
  const prisma = {
    appealCase: {
      findFirst: async () => existing,
      update: async ({ data }: { data: { status: string } }) => {
        updatedStatus = data.status;
        return { ...existing, ...data };
      },
    },
  };
  const service = createAppealService(prisma);
  const result = await service.transition("apl-1", "owner-key-12345678", {
    status: "under_review",
  });
  assert.equal(updatedStatus, "under_review");
  assert.equal(result.status, "under_review");
});

test("AppealService.transition: under_review → resolved requires resolution", async () => {
  const existing = { id: "apl-1", ownerKey: "owner-key-12345678", status: "under_review" };
  const prisma = { appealCase: { findFirst: async () => existing } };
  const service = createAppealService(prisma);

  await assert.rejects(
    () =>
      service.transition("apl-1", "owner-key-12345678", {
        status: "resolved",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /resolution message is required/i);
      return true;
    },
  );
});

test("AppealService.transition: rejects invalid state transitions", async () => {
  const existing = { id: "apl-1", ownerKey: "owner-key-12345678", status: "open" };
  const prisma = { appealCase: { findFirst: async () => existing } };
  const service = createAppealService(prisma);

  await assert.rejects(
    () =>
      service.transition("apl-1", "owner-key-12345678", {
        status: "resolved",
        resolution: "Too early",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /cannot transition/i);
      return true;
    },
  );
});

test("AppealService.transition: closes case with resolution", async () => {
  const existing = { id: "apl-1", ownerKey: "owner-key-12345678", status: "under_review" };
  const prisma = {
    appealCase: {
      findFirst: async () => existing,
      update: async ({ data }: { data: { status: string; resolution: string } }) => ({
        ...existing,
        ...data,
        resolvedAt: new Date(),
      }),
    },
  };
  const service = createAppealService(prisma);
  const result = await service.transition("apl-1", "owner-key-12345678", {
    status: "resolved",
    resolution: "Appeal approved after AI review.",
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.resolution, "Appeal approved after AI review.");
});

test("AppealService.get: throws when appeal not found for owner", async () => {
  const prisma = { appealCase: { findFirst: async () => null } };
  const service = createAppealService(prisma);
  await assert.rejects(
    () => service.get("missing", "owner-key-12345678"),
    NotFoundException,
  );
});

test("AppealDecisionsService.record: persists AI appeal outcome", async () => {
  const record = {
    id: "dec-1",
    appealId: "apl-1",
    contributorId: "contributor-1",
    outcome: "approved",
    modelVersion: "wave5-v1",
    humanOverride: false,
  };
  const repository = {
    create: async () => record,
    findMany: async () => [],
    findFirst: async () => record,
  };
  const audit = { log: async () => {} };
  const service = new AppealDecisionsService(repository as never, audit as never);

  const result = await service.record({
    appealId: "apl-1",
    contributorId: "contributor-1",
    outcome: "approved",
    modelVersion: "wave5-v1",
    rationaleSummary: "Evidence supports overturning the rejection.",
  });

  assert.equal(result.outcome, "approved");
  assert.equal(result.modelVersion, "wave5-v1");
});

test("AppealDecisionsService.listByAppeal: returns decisions for a case", async () => {
  const records = [
    { id: "dec-1", appealId: "apl-1", outcome: "approved", decidedAt: new Date() },
  ];
  const repository = {
    findMany: async () => records,
    create: async () => records[0],
    findFirst: async () => records[0],
  };
  const service = new AppealDecisionsService(repository as never, {} as never);
  const results = await service.listByAppeal("apl-1");
  assert.equal(results.length, 1);
  assert.equal(results[0].appealId, "apl-1");
});

test("AppealDecisionsService.get: throws when decision not found", async () => {
  const repository = {
    findFirst: async () => null,
    create: async () => ({}),
    findMany: async () => [],
  };
  const service = new AppealDecisionsService(repository as never, {} as never);
  await assert.rejects(
    () => service.get("missing"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /appeal decision not found/i);
      return true;
    },
  );
});
