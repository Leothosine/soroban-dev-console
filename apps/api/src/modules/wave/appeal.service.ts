/**
 * BE-208: Appeal intake service with a backend case state machine.
 *
 * State transitions:
 *   open → under_review  (reviewer picks up the case)
 *   under_review → resolved | rejected  (reviewer closes the case)
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { AuditService } from "../../lib/audit.service.js";

export type AppealStatus = "open" | "under_review" | "resolved" | "rejected";

const VALID_TRANSITIONS: Record<AppealStatus, AppealStatus[]> = {
  open: ["under_review"],
  under_review: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
};

export interface CreateAppealDto {
  issueRef: string;
  reason: string;
  evidenceJson?: unknown;
}

export interface TransitionAppealDto {
  status: AppealStatus;
  resolution?: string;
}

@Injectable()
export class AppealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(ownerKey: string, dto: CreateAppealDto) {
    if (!dto.issueRef?.trim()) throw new BadRequestException("issueRef is required.");
    if (!dto.reason?.trim()) throw new BadRequestException("reason is required.");

    const existing = await this.prisma.appealCase.findFirst({
      where: { ownerKey, issueRef: dto.issueRef, status: { in: ["open", "under_review"] } },
    });
    if (existing) {
      throw new BadRequestException(
        `An active appeal for issue "${dto.issueRef}" already exists (id: ${existing.id}).`,
      );
    }

    const appeal = await this.prisma.appealCase.create({
      data: {
        ownerKey,
        issueRef: dto.issueRef.trim(),
        reason: dto.reason.trim(),
        evidenceJson: (dto.evidenceJson ?? null) as any,
      },
    });

    void this.audit.log({
      actor: ownerKey,
      action: "appeal.created",
      resourceType: "appeal_case",
      resourceId: appeal.id,
      summary: `Appeal opened for issue ${dto.issueRef}`,
    });

    return appeal;
  }

  async list(ownerKey: string) {
    return this.prisma.appealCase.findMany({
      where: { ownerKey },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string, ownerKey: string) {
    const appeal = await this.prisma.appealCase.findFirst({ where: { id, ownerKey } });
    if (!appeal) throw new NotFoundException("Appeal case not found.");
    return appeal;
  }

  async transition(id: string, ownerKey: string, dto: TransitionAppealDto) {
    const appeal = await this.get(id, ownerKey);
    const current = appeal.status as AppealStatus;
    const allowed = VALID_TRANSITIONS[current];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition appeal from "${current}" to "${dto.status}". Allowed: [${allowed.join(", ")}].`,
      );
    }

    const isTerminal = dto.status === "resolved" || dto.status === "rejected";
    if (isTerminal && !dto.resolution?.trim()) {
      throw new BadRequestException("A resolution message is required when closing an appeal.");
    }

    const updated = await this.prisma.appealCase.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution?.trim() ?? null,
        resolvedAt: isTerminal ? new Date() : null,
      },
    });

    void this.audit.log({
      actor: ownerKey,
      action: `appeal.${dto.status}`,
      resourceType: "appeal_case",
      resourceId: id,
      summary: `Appeal transitioned to ${dto.status}`,
    });

    return updated;
  }
}
