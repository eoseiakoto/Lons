/**
 * EXAMPLE: Customer Resolver with Field-Level Authorization
 *
 * This example shows how to implement field-level authorization for sensitive PII fields.
 * Apply @Roles() at the resolver level for resource-level authorization.
 * Use @FieldAuth() and authorizeField() for field-level authorization.
 */

import { Resolver, Query, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import {
  CustomerService,
  CurrentTenant,
  Roles,
  FieldAuth,
  authorizeField,
} from '@lons/entity-service';

import { CustomerType } from '../types/customer.type';

// Assuming CustomerType is:
// @ObjectType()
// export class CustomerType {
//   @Field(() => ID)
//   id: string;
//
//   @Field()
//   externalId: string;
//
//   @Field({ nullable: true })
//   fullName?: string;
//
//   @Field({ nullable: true })
//   email?: string;
//
//   @Field({ nullable: true })
//   phonePrimary?: string;
//
//   @Field({ nullable: true })
//   nationalId?: string;
//
//   @Field()
//   status: string;
// }

@Resolver(() => CustomerType)
export class CustomerResolverWithFieldAuth {
  constructor(private customerService: CustomerService) {}

  /**
   * Query with resource-level authorization
   * Requires 'customer:read' permission to call this resolver
   */
  @Query(() => CustomerType)
  @Roles('customer:read')
  async customer(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CustomerType> {
    return this.customerService.findById(tenantId, id) as unknown as CustomerType;
  }

  /**
   * Field resolver for email (PII)
   * Requires 'customer:read:pii' permission
   * Returns null if user lacks permission
   */
  @ResolveField('email')
  async resolveEmail(
    @Parent() customer: any,
    @FieldAuth('customer:read:pii') hasPermission: boolean,
  ): Promise<string | null> {
    return authorizeField(customer.email, hasPermission);
  }

  /**
   * Field resolver for phone (PII)
   * Requires 'customer:read:pii' permission
   * Returns null if user lacks permission
   */
  @ResolveField('phonePrimary')
  async resolvePrimaryPhone(
    @Parent() customer: any,
    @FieldAuth('customer:read:pii') hasPermission: boolean,
  ): Promise<string | null> {
    return authorizeField(customer.phonePrimary, hasPermission);
  }

  /**
   * Field resolver for national ID (Sensitive PII)
   * Requires 'customer:read:sensitive' permission
   * Returns null if user lacks permission
   */
  @ResolveField('nationalId')
  async resolveNationalId(
    @Parent() customer: any,
    @FieldAuth('customer:read:sensitive') hasPermission: boolean,
  ): Promise<string | null> {
    return authorizeField(customer.nationalId, hasPermission);
  }

  /**
   * Field resolver for full name
   * Only return when paired with ID (sensitive context)
   * Requires 'customer:read:pii' permission
   */
  @ResolveField('fullName')
  async resolveFullName(
    @Parent() customer: any,
    @FieldAuth('customer:read:pii') hasPermission: boolean,
  ): Promise<string | null> {
    return authorizeField(customer.fullName, hasPermission);
  }

  /**
   * Non-PII fields don't need authorization
   * They can be resolved normally without field-level checks
   */
  @ResolveField('id')
  async resolveId(@Parent() customer: any): Promise<string> {
    return customer.id;
  }

  @ResolveField('externalId')
  async resolveExternalId(@Parent() customer: any): Promise<string> {
    return customer.externalId;
  }

  @ResolveField('status')
  async resolveStatus(@Parent() customer: any): Promise<string> {
    return customer.status;
  }
}

/**
 * PERMISSION MAPPING REFERENCE
 *
 * Resource-level permissions (for @Roles):
 * - customer:read       - View customer basic info
 * - customer:create     - Create new customer
 * - customer:update     - Update customer data
 * - customer:delete     - Delete customer (soft delete)
 * - customer:blacklist  - Add/remove customer from blacklist
 *
 * Field-level permissions (for @FieldAuth):
 * - customer:read:pii       - View PII fields (email, phone, full name)
 * - customer:read:sensitive - View sensitive PII (national ID, date of birth)
 * - customer:read:kyc       - View KYC/identity verification data
 * - customer:read:segment   - View customer segment/classification
 *
 * Example role permissions:
 * SP_OPERATOR: [customer:read, customer:create, customer:update, customer:read:pii]
 * SP_ANALYST:  [customer:read, customer:read:pii, customer:read:segment]
 * SP_AUDITOR:  [customer:read, customer:read:pii, customer:read:sensitive, customer:read:kyc]
 * SP_ADMIN:    [*] (all permissions)
 */

/**
 * IMPLEMENTATION STEPS
 *
 * 1. Define role permissions in your role management:
 *    - Create roles with appropriate permission arrays
 *    - Store permissions in role.permissions (JSON array)
 *
 * 2. Apply @Roles() to resolvers that need resource-level auth:
 *    @Roles('customer:read')
 *    async customer(...) { ... }
 *
 * 3. For PII fields, use @ResolveField with @FieldAuth():
 *    @ResolveField('email')
 *    async resolveEmail(
 *      @Parent() customer: any,
 *      @FieldAuth('customer:read:pii') hasPermission: boolean,
 *    ) {
 *      return authorizeField(customer.email, hasPermission);
 *    }
 *
 * 4. The authorizeField() helper returns null if unauthorized
 *    This prevents PII leakage while maintaining a valid GraphQL response
 *
 * 5. In the client, users will see null for fields they can't access:
 *    {
 *      customer: {
 *        id: "123",
 *        email: null,    // authorized users see actual email
 *        phone: null,    // authorized users see actual phone
 *        status: "active"
 *      }
 *    }
 */
