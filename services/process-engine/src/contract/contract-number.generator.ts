import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lons/database';

@Injectable()
export class ContractNumberGenerator {
  constructor(private prisma: PrismaService) {}

  async generate(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.contract.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
    });
    const sequenceNumber = String(count + 1).padStart(5, '0');
    return `LON-${year}-${sequenceNumber}`;
  }
}
