import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { PlatformConfigService, Roles } from '@lons/entity-service';

import { PlatformDefaultsType } from '../types/platform-defaults.type';
import { PlatformDefaultsInput } from '../inputs/platform-defaults.input';

@Resolver()
export class PlatformConfigResolver {
  constructor(private configService: PlatformConfigService) {}

  @Query(() => PlatformDefaultsType)
  @Roles('platform_admin')
  async platformDefaults(): Promise<PlatformDefaultsType> {
    return this.configService.getDefaults();
  }

  @Mutation(() => PlatformDefaultsType)
  @Roles('platform_admin')
  async updatePlatformDefaults(
    @Args('input') input: PlatformDefaultsInput,
  ): Promise<PlatformDefaultsType> {
    return this.configService.updateDefaults(input);
  }
}
