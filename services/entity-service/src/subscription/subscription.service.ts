import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async activate(tenantId: string, data: {
    customerId: string;
    productId: string;
    creditLimit?: number;
  }) {
    // Check if active subscription already exists
    const existing = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        customerId: data.customerId,
        productId: data.productId,
        status: 'active',
      },
    });
    if (existing) {
      throw new ValidationError('Active subscription already exists for this customer and product');
    }

    return this.prisma.subscription.create({
      data: {
        tenantId,
        customer: { connect: { id: data.customerId } },
        product: { connect: { id: data.productId } },
        creditLimit: data.creditLimit,
        availableLimit: data.creditLimit,
        status: 'active',
        activatedAt: new Date(),
      },
      include: { customer: true, product: true },
    });
  }

  async deactivate(tenantId: string, id: string) {
    const subscription = await this.findById(tenantId, id);
    if (subscription.status !== 'active') {
      throw new ValidationError('Subscription is not active');
    }
    return this.prisma.subscription.update({
      where: { id },
      data: { status: 'deactivated', deactivatedAt: new Date() },
      include: { customer: true, product: true },
    });
  }

  async findById(tenantId: string, id: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, tenantId },
      include: { customer: true, product: true },
    });
    if (!subscription) throw new NotFoundError('Subscription', id);
    return subscription;
  }

  async findByCustomer(tenantId: string, customerId: string) {
    return this.prisma.subscription.findMany({
      where: { tenantId, customerId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByProduct(tenantId: string, productId: string, take: number = 20, cursor?: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { tenantId, productId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    return { items: subs.slice(0, take), hasMore: subs.length > take };
  }
}
