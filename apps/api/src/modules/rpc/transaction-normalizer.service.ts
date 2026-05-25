import { Injectable } from "@nestjs/common";
import { rpc as SorobanRpc } from "@stellar/stellar-sdk";
import {
  NormalizedTransactionResult,
  NormalizedSimulationPayload,
  NormalizedTransactionStatus,
} from "@devconsole/api-contracts";

@Injectable()
export class TransactionNormalizerService {
  private toBase64Xdr(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (
      value &&
      typeof value === "object" &&
      "toXDR" in value &&
      typeof value.toXDR === "function"
    ) {
      return value.toXDR("base64");
    }
    return undefined;
  }

  private toIsoTimestamp(value: unknown): string | undefined {
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }

    if (value && typeof value === "object") {
      const candidate = value as { toISOString?: () => string };
      if (typeof candidate.toISOString === "function") {
        return candidate.toISOString();
      }
    }

    return undefined;
  }

  /**
   * Normalize simulation transaction responses to a stable shape
   */
  normalizeSimulation(
    response: SorobanRpc.Api.SimulateTransactionResponse,
  ): NormalizedSimulationPayload {
    if (SorobanRpc.Api.isSimulationError(response)) {
      return {
        ok: false,
        error: response.error || "Unknown simulation error",
        auth: [],
        requiredAuthKeys: [],
        stateChangesCount: 0,
      };
    }

    const success = response as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    
    return {
      ok: true,
      resultXdr: success.result?.retval?.toXDR("base64"),
      minResourceFee: success.minResourceFee,
      auth: this.normalizeAuth(success),
      requiredAuthKeys: this.extractRequiredAuthKeys(success),
      stateChangesCount: success.stateChanges?.length ?? 0,
      cpuInsns: this.extractCpuInstructions(success),
      memBytes: this.extractMemoryBytes(success),
    };
  }

  /**
   * Normalize send transaction responses to a stable shape
   */
  normalizeSendTransaction(
    response: SorobanRpc.Api.SendTransactionResponse,
  ): NormalizedTransactionResult {
    const hash = "hash" in response ? response.hash : undefined;

    return {
      status: this.mapSendTransactionStatus(response.status),
      hash,
      error:
        response.status === "ERROR"
          ? "Transaction submission failed"
          : undefined,
    };
  }

  /**
   * Normalize get transaction responses to a stable shape
   */
  normalizeGetTransaction(
    response: SorobanRpc.Api.GetTransactionResponse,
  ): NormalizedTransactionResult {
    const status = this.mapGetTransactionStatus(response.status);

    const normalized: NormalizedTransactionResult = {
      status,
      error: status === "failed" ? this.extractTransactionError(response) : undefined,
    };

    if ("hash" in response && typeof response.hash === "string") {
      normalized.hash = response.hash;
    }
    if ("ledger" in response && typeof response.ledger === "number") {
      normalized.ledger = response.ledger;
    }
    if ("createdAt" in response) {
      normalized.createdAt = this.toIsoTimestamp(response.createdAt);
    }
    if ("resultXdr" in response) {
      normalized.resultXdr = this.toBase64Xdr(response.resultXdr);
    }
    if ("resultMetaXdr" in response) {
      normalized.resultMetaXdr = this.toBase64Xdr(response.resultMetaXdr);
    }

    return normalized;
  }

  private normalizeAuth(
    simulation: SorobanRpc.Api.SimulateTransactionSuccessResponse,
  ): Array<{ address: string; kind: "account" | "contract" | "unknown" }> {
    return (
      simulation.result?.auth?.flatMap((entry) => {
        try {
          const credentials = entry.credentials();
          if (credentials.switch().name !== "sorobanCredentialsAddress") {
            return [];
          }

          const authAddress = credentials.address().address();
          const kind =
            authAddress.switch().name === "scAddressTypeAccount"
              ? "account"
              : authAddress.switch().name === "scAddressTypeContract"
                ? "contract"
                : "unknown";

          return [
            {
              address: authAddress.toString(),
              kind,
            },
          ];
        } catch {
          return [];
        }
      }) ?? []
    );
  }

  private extractRequiredAuthKeys(
    simulation: SorobanRpc.Api.SimulateTransactionSuccessResponse,
  ): string[] {
    return this.normalizeAuth(simulation)
      .filter((entry) => entry.kind === "account")
      .map((entry) => entry.address);
  }

  private extractCpuInstructions(
    simulation: SorobanRpc.Api.SimulateTransactionSuccessResponse,
  ): number | undefined {
    const maybePayload = simulation as any;
    const maybeCost = maybePayload["cost"] as
      | {
          cpuInsns?: string | number;
          cpuInstructions?: string | number;
          cpu_insns?: string | number;
        }
      | undefined;

    const cpuInsns = Number(
      maybeCost?.cpuInsns ?? maybeCost?.cpuInstructions ?? maybeCost?.cpu_insns,
    );

    return Number.isFinite(cpuInsns) ? cpuInsns : undefined;
  }

  private extractMemoryBytes(
    simulation: SorobanRpc.Api.SimulateTransactionSuccessResponse,
  ): number | undefined {
    const maybePayload = simulation as any;
    const maybeCost = maybePayload["cost"] as
      | {
          memBytes?: string | number;
          mem_bytes?: string | number;
        }
      | undefined;

    const memBytes = Number(maybeCost?.memBytes ?? maybeCost?.mem_bytes);

    return Number.isFinite(memBytes) ? memBytes : undefined;
  }

  private mapSendTransactionStatus(
    status: SorobanRpc.Api.SendTransactionStatus,
  ): NormalizedTransactionStatus {
    switch (status) {
      case "PENDING":
        return "pending";
      case "ERROR":
        return "failed";
      default:
        return "failed";
    }
  }

  private mapGetTransactionStatus(
    status: SorobanRpc.Api.GetTransactionStatus,
  ): NormalizedTransactionStatus {
    const rawStatus = String(status);
    if (rawStatus === "SUCCESS") return "success";
    if (rawStatus === "FAILED") return "failed";
    return "pending";
  }

  private extractTransactionError(
    _response: SorobanRpc.Api.GetTransactionResponse,
  ): string | undefined {
    return "Transaction failed";
  }
}
