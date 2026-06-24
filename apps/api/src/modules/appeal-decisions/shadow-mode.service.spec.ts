import { ShadowModeService } from "./shadow-mode.service.js";

const BASE_REQUEST = {
  appealId: "appeal-1",
  contributorId: "contrib-1",
  issueRef: "issue-42",
  features: { commentCount: 3 },
};

describe("ShadowModeService", () => {
  let svc: ShadowModeService;

  beforeEach(() => {
    svc = new ShadowModeService();
  });

  it("returns a result without divergence when bands match", async () => {
    const result = await svc.scoreShadow(
      { ...BASE_REQUEST, liveScore: 0.85 },
      async () => 0.9,
    );
    expect(result).not.toBeNull();
    expect(result!.diverged).toBe(false);
    expect(result!.delta).toBeCloseTo(0.05);
  });

  it("flags divergence when bands differ", async () => {
    const result = await svc.scoreShadow(
      { ...BASE_REQUEST, liveScore: 0.85 },
      async () => 0.5, // live=approve, candidate=review
    );
    expect(result!.diverged).toBe(true);
  });

  it("returns null (without throwing) when the candidate scorer throws", async () => {
    const result = await svc.scoreShadow(
      { ...BASE_REQUEST, liveScore: 0.5 },
      async () => { throw new Error("model unavailable"); },
    );
    expect(result).toBeNull();
  });

  it("clamps candidate score to [0, 1]", async () => {
    const result = await svc.scoreShadow(
      { ...BASE_REQUEST, liveScore: 0.5 },
      async () => 5.0,
    );
    expect(result!.candidateScore).toBe(1);
  });

  it("records latencyMs and scoredAt", async () => {
    const result = await svc.scoreShadow(
      { ...BASE_REQUEST, liveScore: 0.5 },
      async () => 0.5,
    );
    expect(result!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result!.scoredAt).toMatch(/^\d{4}-/);
  });

  it("accepts synchronous scorers", async () => {
    const result = await svc.scoreShadow(
      { ...BASE_REQUEST, liveScore: 0.5 },
      () => 0.5,
    );
    expect(result).not.toBeNull();
  });
});
