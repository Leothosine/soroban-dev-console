"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppealTimeline } from "@/components/appeal-timeline";
import { getAppealFixture } from "@/lib/appeal-fixtures";

function AppealStatusContent() {
  const searchParams = useSearchParams();
  const fixture = searchParams.get("fixture");
  const appeal = getAppealFixture(fixture);

  return <AppealTimeline appeal={appeal} />;
}

export default function AppealStatusPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Appeal status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track the progress of your appeal through intake, review, and decision.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Loading appeal status…
          </div>
        }
      >
        <AppealStatusContent />
      </Suspense>
    </div>
  );
}
