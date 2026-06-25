import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "./audit.service.js";

export interface AccessRequest {
  principal: string;
  resource: string;
  action: string;
  resourceOwner?: string;
}

@Injectable()
export class PermissionBoundaryService {
  private readonly logger = new Logger(PermissionBoundaryService.name);

  constructor(private readonly audit: AuditService) {}

  verifyOwnership(access: AccessRequest): boolean {
    if (!access.resourceOwner) {
      this.logger.warn(`Ownership check failed: no owner for ${access.resource}`);
      return false;
    }

    const isOwner = access.principal === access.resourceOwner;
    if (!isOwner) {
      this.logger.warn(`Permission denied: ${access.principal} is not owner of ${access.resource}`);
      this.audit.log({
        actor: access.principal,
        action: "permission.denied",
        resourceType: access.resource,
        resourceId: "ownership",
        summary: `Ownership check failed for ${access.action} on ${access.resource}`,
      });
    }

    return isOwner;
  }

  verifyScope(access: AccessRequest, allowedScopes: string[]): boolean {
    if (allowedScopes.length === 0) {
      this.logger.warn(`Scope check failed: no allowed scopes for ${access.resource}:${access.action}`);
      return false;
    }

    const hasScope = allowedScopes.some(
      (scope) => access.resource.startsWith(scope) || scope === "*",
    );

    if (!hasScope) {
      this.logger.warn(`Scope denied: ${access.principal} lacks scope for ${access.resource}`);
      this.audit.log({
        actor: access.principal,
        action: "permission.scope_denied",
        resourceType: access.resource,
        resourceId: "scope",
        summary: `Scope check failed for ${access.action}`,
      });
    }

    return hasScope;
  }
}
