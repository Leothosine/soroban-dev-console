import type { AppealCase } from "@/components/appeal-timeline";

/** In-progress appeal in AI review (default contributor status view). */
export const APPEAL_IN_PROGRESS: AppealCase = {
  id: "APL-001",
  issueNumber: "42",
  issueTitle: "Fix contract storage serialization",
  submittedAt: "May 26, 2026",
  currentStage: "ai_review",
  outcome: null,
  timeline: [
    {
      stage: "submitted",
      label: "Appeal submitted",
      timestamp: "May 26, 10:02",
      status: "complete",
    },
    {
      stage: "intake",
      label: "Intake review",
      timestamp: "May 26, 10:05",
      note: "Evidence validated and queued for AI analysis.",
      status: "complete",
    },
    {
      stage: "ai_review",
      label: "AI analysis",
      note: "Reviewing submitted evidence against review history.",
      status: "active",
    },
    {
      stage: "human_review",
      label: "Human review",
      status: "pending",
    },
    {
      stage: "decided",
      label: "Decision",
      status: "pending",
    },
  ],
};

/** Terminal appeal with an approved outcome. */
export const APPEAL_APPROVED: AppealCase = {
  id: "APL-002",
  issueNumber: "38",
  issueTitle: "Add RPC failover logic",
  submittedAt: "May 24, 2026",
  currentStage: "decided",
  outcome: "approved",
  timeline: [
    {
      stage: "submitted",
      label: "Appeal submitted",
      timestamp: "May 24, 09:10",
      status: "complete",
    },
    {
      stage: "intake",
      label: "Intake review",
      timestamp: "May 24, 09:12",
      status: "complete",
    },
    {
      stage: "ai_review",
      label: "AI analysis",
      timestamp: "May 24, 09:30",
      note: "Recommended approval with high confidence.",
      status: "complete",
    },
    {
      stage: "human_review",
      label: "Human review",
      timestamp: "May 24, 14:00",
      status: "complete",
    },
    {
      stage: "decided",
      label: "Decision",
      timestamp: "May 24, 14:05",
      note: "Appeal approved. Points will be credited.",
      status: "complete",
    },
  ],
};

export type AppealStatusFixture = "in-progress" | "approved";

export function getAppealFixture(fixture?: string | null): AppealCase {
  if (fixture === "approved") return APPEAL_APPROVED;
  return APPEAL_IN_PROGRESS;
}
