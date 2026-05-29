"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppealWorkspace, type AppealSubmission } from "@/components/appeal-workspace";
import {
  VerificationBanner,
  VerificationGate,
  type VerificationGateStatus,
} from "@/components/verification-banner";

async function submitAppeal(submission: AppealSubmission): Promise<void> {
  // Placeholder — wire to BE-208 appeal intake API when available
  await new Promise((resolve) => setTimeout(resolve, 400));
  console.log("Appeal submitted:", submission);
}

function AppealSubmitContent() {
  const searchParams = useSearchParams();
  const isVerifiedFixture = searchParams.get("fixture") === "verified";
  const verificationStatus: VerificationGateStatus = isVerifiedFixture
    ? "verified"
    : "unverified";
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(submission: AppealSubmission) {
    await submitAppeal(submission);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        role="status"
        className="rounded-lg border bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800 px-4 py-3 text-sm"
      >
        Appeal submitted successfully. Track progress on the{" "}
        <a href="/appeals/status" className="underline underline-offset-2 font-medium">
          appeal status
        </a>{" "}
        page.
      </div>
    );
  }

  return (
    <>
      {verificationStatus !== "verified" && (
        <VerificationBanner status={verificationStatus} />
      )}
      <VerificationGate status={verificationStatus} action="submit an appeal">
        <AppealWorkspace onSubmit={handleSubmit} />
      </VerificationGate>
    </>
  );
}

export default function AppealSubmitPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Submit an appeal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Provide structured evidence so your appeal can be reviewed accurately.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Loading appeal form…
          </div>
        }
      >
        <AppealSubmitContent />
      </Suspense>
    </div>
  );
}
