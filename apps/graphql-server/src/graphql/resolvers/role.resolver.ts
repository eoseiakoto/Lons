import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { RoleService, CurrentTenant, Roles } from '@lons/entity-service';

import { RoleType } from '../types/role.type';

@Resolver(() => RoleType)
export class RoleResolver {
  constructor(private roleService: RoleService) {}

  @Query(() => [RoleType])
  @Roles('role:read')
  async roles(
    @CurrentTenant() tenantId: string,
  ): Promise<RoleType[]> {
    return this.roleService.findAll(tenantId) as unknown as RoleType[];
  }

  @Query(() => RoleType)
  @Roles('role:read')
  async role(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<RoleType> {
    return this.roleService.findById(tenantId, id) as unknown as RoleType;
  }
}
