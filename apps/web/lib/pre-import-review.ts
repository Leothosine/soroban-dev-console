/**
 * FE-059: Pre-import review and selective restore workflow.
 */

import {
  importWorkspace,
  type SerializedWorkspace,
  type ValidationResult,
} from "@/lib/workspace-serializer";
import type { Contract } from "@/store/useContractStore";
import type { SavedCall } from "@/store/useSavedCallsStore";
import type { WorkspaceNote } from "@/store/workspace-schema";

export interface ImportPreview {
  workspace: SerializedWorkspace["workspace"];
  contracts: Contract[];
  savedCalls: SavedCall[];
  notes: WorkspaceNote[];
  validation: ValidationResult;
  statistics: {
    totalContracts: number;
    importableContracts: number;
    totalCalls: number;
    importableCalls: number;
    totalNotes: number;
    importableNotes: number;
  };
}

export interface ImportSelection {
  restoreWorkspace: boolean;
  restoreContracts: boolean;
  restoreSavedCalls: boolean;
  restoreNotes: boolean;
  selectedContractIds?: string[];
  selectedCallIds?: string[];
  selectedNoteIds?: string[];
}

export interface ImportReviewOptions {
  autoSelectAll?: boolean;
  requireUserConfirmation?: boolean;
}

export function generateImportPreview(
  raw: unknown,
  _options: ImportReviewOptions = {},
): ImportPreview {
  const { payload, validation } = importWorkspace(raw);

  return {
    workspace: payload.workspace,
    contracts: payload.contracts,
    savedCalls: payload.savedCalls,
    notes: payload.notes,
    validation,
    statistics: {
      totalContracts: payload.contracts.length,
      importableContracts: payload.contracts.length,
      totalCalls: payload.savedCalls.length,
      importableCalls: payload.savedCalls.length,
      totalNotes: payload.notes.length,
      importableNotes: payload.notes.length,
    },
  };
}

function pickSelectedIds<T extends { id: string }>(
  entries: T[],
  shouldRestore: boolean,
  selectedIds?: string[],
): T[] {
  if (!shouldRestore) return [];
  if (!selectedIds || selectedIds.length === 0) return entries;

  const idSet = new Set(selectedIds);
  return entries.filter((entry) => idSet.has(entry.id));
}

export function applyImportSelection(
  preview: ImportPreview,
  selection: ImportSelection,
): SerializedWorkspace {
  const contracts = pickSelectedIds(
    preview.contracts,
    selection.restoreContracts,
    selection.selectedContractIds,
  );
  const savedCalls = pickSelectedIds(
    preview.savedCalls,
    selection.restoreSavedCalls,
    selection.selectedCallIds,
  );
  const notes = pickSelectedIds(
    preview.notes,
    selection.restoreNotes,
    selection.selectedNoteIds,
  );

  if (!selection.restoreWorkspace) {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      workspace: {
        ...preview.workspace,
        contractIds: [],
        savedCallIds: [],
        artifactRefs: [],
      },
      contracts,
      savedCalls,
      notes,
    };
  }

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    workspace: {
      ...preview.workspace,
      contractIds: contracts.map((contract) => contract.id),
      savedCallIds: savedCalls.map((savedCall) => savedCall.id),
      artifactRefs: preview.workspace.artifactRefs ?? [],
    },
    contracts,
    savedCalls,
    notes: notes.map((note) => ({
      ...note,
      workspaceId: preview.workspace.id,
    })),
  };
}

export function formatValidationSummary(validation: ValidationResult): {
  hasIssues: boolean;
  errorCount: number;
  warningCount: number;
  summary: string;
  issues: Array<{
    type: "error" | "warning";
    message: string;
    count?: number;
    items?: string[];
  }>;
} {
  const errorCount = validation.errors.length;
  const warningCount = validation.warnings.length;
  const hasIssues = errorCount > 0 || warningCount > 0;

  const issues = [
    ...validation.errors.map((error) => ({
      type: "error" as const,
      message: error,
      count: 1,
    })),
    ...validation.warnings.map((warning) => ({
      type: "warning" as const,
      message: warning,
      count: 1,
    })),
  ];

  const summaryParts: string[] = [];
  if (errorCount > 0) {
    summaryParts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  }
  if (warningCount > 0) {
    summaryParts.push(
      `${warningCount} warning${warningCount === 1 ? "" : "s"}`,
    );
  }

  return {
    hasIssues,
    errorCount,
    warningCount,
    summary: summaryParts.join(", ") || "No issues detected",
    issues,
  };
}
