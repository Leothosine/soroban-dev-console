import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { OwnerKeyGuard } from "../../auth/owner-key.guard.js";
import { AbuseRiskService, RiskScoreRequest } from "./abuse-risk.service.js";

type OwnerKeyRequest = Request & { ownerKey: string };

@Controller("wave/risk")
@UseGuards(OwnerKeyGuard)
export class AbuseRiskController {
  constructor(private readonly abuseRiskService: AbuseRiskService) {}

  @Post("score")
  @HttpCode(HttpStatus.OK)
  score(@Body() dto: Omit<RiskScoreRequest, "ownerKey">, @Req() req: Request) {
    return this.abuseRiskService.publicScore({
      ...dto,
      ownerKey: (req as OwnerKeyRequest).ownerKey,
    });
  }
}
