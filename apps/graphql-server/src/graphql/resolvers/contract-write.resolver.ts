import { Resolver, Mutation, Args, ID } from '@nestjs/graphql';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { ContractWriteOperationsService } from '@lons/process-engine';
import {
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
} from '@lons/entity-service';

import { ContractType } from '../types/contract.type';
import { RepaymentType } from '../types/repayment.type';
import {
  ManualPaymentInput,
  RestructureContractInput,
  WaivePenaltiesInput,
} from '../inputs/contract-operations.input';

/**
 * Sprint 18 (S18-2 / FR-LO-003.2) — operator write operations on
 * contracts: manual payment, restructure, penalty waiver.
 *
 * Idempotency: `idempotencyKey` is required for `recordManualPayment`
 * (payments are non-recoverable side effects). Restructure and waiver
 * are state changes whose duplicate-call semantics are handled inside
 * the service via metadata-history append (multiple identical
 * restructures simply produce multiple history entries).
 */
@Resolver()
export class ContractWriteResolver {
  constructor(
    private readonly writeOps: ContractWriteOperationsService,
  ) {}

  @Mutation(() => RepaymentType)
  @AuditAction(AuditActionType.MANUAL_PAYMENT, AuditResourceType.REPAYMENT)
  @Roles('contract:update')
  async recordManualPayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('input', { type: () => ManualPaymentInput }) input: ManualPaymentInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<RepaymentType> {
    const repayment = await this.writeOps.recordManualPayment(tenantId, contractId, {
      ...input,
      operatorId: user.userId,
      idempotencyKey,
    });
    return repayment as unknown as RepaymentType;
  }

  @Mutation(() => ContractType)
  @AuditAction(AuditActionType.CONTRACT_RESTRUCTURE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async restructureContract(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('input', { type: () => RestructureContractInput })
    input: RestructureContractInput,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<ContractType> {
    const contract = await this.writeOps.restructureContract(tenantId, contractId, {
      ...input,
      operatorId: user.userId,
    });
    return contract as unknown as ContractType;
  }

  @Mutation(() => ContractType)
  @AuditAction(AuditActionType.PENALTY_WAIVER, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async waivePenalties(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('input', { type: () => WaivePenaltiesInput }) input: WaivePenaltiesInput,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<ContractType> {
    const contract = await this.writeOps.waivePenalties(tenantId, contractId, {
      ...input,
      operatorId: user.userId,
    });
    return contract as unknown as ContractType;
  }
}
