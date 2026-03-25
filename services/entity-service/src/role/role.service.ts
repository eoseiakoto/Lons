import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

@Injectable()
export class RoleService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: {
    name: string;
    description?: string;
    permissions: Prisma.InputJsonValue;
  }) {
    return this.prisma.role.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        permissions: data.permissions,
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
    });
    if (!role) throw new NotFoundError('Role', id);
    return role;
  }

  async findAll(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async update(tenantId: string, id: string, data: {
    name?: string;
    description?: string;
    permissions?: Prisma.InputJsonValue;
  }) {
    const role = await this.findById(tenantId, id);
    if (role.isSystem && data.name) {
      throw new ValidationError('Cannot rename system roles');
    }

    const updateData: Prisma.RoleUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.permissions !== undefined) updateData.permissions = data.permissions;

    return this.prisma.role.update({ where: { id }, data: updateData });
  }

  async delete(tenantId: string, id: string) {
    const role = await this.findById(tenantId, id);
    if (role.isSystem) {
      throw new ValidationError('Cannot delete system roles');
    }
    // Check if any users are assigned this role
    const userCount = await this.prisma.user.count({
      where: { roleId: id, tenantId, deletedAt: null },
    });
    if (userCount > 0) {
      throw new ValidationError('Cannot delete role with assigned users', { userCount });
    }
    await this.prisma.role.delete({ where: { id } });
  }
}
