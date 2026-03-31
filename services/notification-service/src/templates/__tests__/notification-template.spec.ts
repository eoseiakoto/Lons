import { Test } from '@nestjs/testing';
import { NotificationTemplateService } from '../notification-template.service';

const mockPrisma = {
  notificationTemplate: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('NotificationTemplateService', () => {
  let service: NotificationTemplateService;

  beforeEach(async () => {
    jest.clearAllMocks();

    await Test.createTestingModule({
      providers: [
        NotificationTemplateService,
        { provide: 'PrismaService', useValue: mockPrisma },
      ],
    })
      .overrideProvider('PrismaService')
      .useValue(mockPrisma)
      .compile();

    // Manually instantiate to inject mock
    service = new NotificationTemplateService(mockPrisma as any);
  });

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const templateId = '22222222-2222-2222-2222-222222222222';

  describe('create', () => {
    const createData = {
      eventType: 'loan_approved',
      channel: 'sms',
      templateBody: 'Dear {{customerName}}, your loan is approved.',
      language: 'en',
    };

    it('should create a new template', async () => {
      const expected = { id: templateId, tenantId, ...createData, version: 1, isActive: true };
      mockPrisma.notificationTemplate.create.mockResolvedValue(expected);

      const result = await service.create(tenantId, createData);

      expect(mockPrisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          productId: null,
          eventType: createData.eventType,
          channel: createData.channel,
          templateBody: createData.templateBody,
          language: 'en',
          isActive: true,
          version: 1,
        },
      });
      expect(result).toEqual(expected);
    });

    it('should return existing template on idempotent create', async () => {
      const existing = { id: templateId, tenantId, ...createData, version: 1 };
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(existing);

      const result = await service.create(tenantId, createData, 'idem-key-1');

      expect(mockPrisma.notificationTemplate.findFirst).toHaveBeenCalled();
      expect(mockPrisma.notificationTemplate.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('should create new template when idempotency key provided but no match', async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);
      const expected = { id: templateId, tenantId, ...createData, version: 1 };
      mockPrisma.notificationTemplate.create.mockResolvedValue(expected);

      const result = await service.create(tenantId, createData, 'idem-key-2');

      expect(mockPrisma.notificationTemplate.create).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });
  });

  describe('update (versioning)', () => {
    it('should soft-delete old version and create a new version', async () => {
      const existing = {
        id: templateId,
        tenantId,
        productId: null,
        eventType: 'loan_approved',
        channel: 'sms',
        templateBody: 'Old body',
        language: 'en',
        version: 1,
        isActive: true,
      };
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.notificationTemplate.update.mockResolvedValue({ ...existing, deletedAt: new Date() });

      const newVersion = { ...existing, id: 'new-id', version: 2, templateBody: 'New body' };
      mockPrisma.notificationTemplate.create.mockResolvedValue(newVersion);

      const result = await service.update(templateId, tenantId, {
        templateBody: 'New body',
      });

      // Old version should be soft-deleted
      expect(mockPrisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: templateId },
        data: expect.objectContaining({ isActive: false }),
      });

      // New version should be created with incremented version
      expect(mockPrisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          templateBody: 'New body',
          version: 2,
        }),
      });

      expect(result.version).toBe(2);
    });

    it('should throw when template not found', async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', tenantId, { templateBody: 'x' }),
      ).rejects.toThrow('Notification template not found');
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt and isActive=false', async () => {
      const existing = { id: templateId, tenantId, deletedAt: null };
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.notificationTemplate.update.mockResolvedValue({
        ...existing,
        deletedAt: new Date(),
        isActive: false,
      });

      const result = await service.softDelete(templateId, tenantId);

      expect(mockPrisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: templateId },
        data: expect.objectContaining({ isActive: false }),
      });
      expect(result.deletedAt).toBeTruthy();
    });

    it('should throw when template not found', async () => {
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent', tenantId)).rejects.toThrow(
        'Notification template not found',
      );
    });
  });

  describe('findByProductAndEvent', () => {
    it('should query with tenant isolation', async () => {
      mockPrisma.notificationTemplate.findMany.mockResolvedValue([]);

      await service.findByProductAndEvent(tenantId);

      expect(mockPrisma.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId,
          deletedAt: null,
          isActive: true,
        }),
        orderBy: expect.any(Array),
      });
    });

    it('should filter by productId and eventType', async () => {
      mockPrisma.notificationTemplate.findMany.mockResolvedValue([]);
      const productId = '33333333-3333-3333-3333-333333333333';

      await service.findByProductAndEvent(tenantId, productId, 'loan_approved', 'sms');

      expect(mockPrisma.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId,
          productId,
          eventType: 'loan_approved',
          channel: 'sms',
        }),
        orderBy: expect.any(Array),
      });
    });
  });

  describe('tenant isolation', () => {
    it('should always include tenantId in queries', async () => {
      const otherTenantId = '99999999-9999-9999-9999-999999999999';
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);

      await service.findById(templateId, otherTenantId);

      expect(mockPrisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ tenantId: otherTenantId }),
      });
    });
  });

  describe('findActiveTemplate', () => {
    it('should return the latest active version', async () => {
      const template = {
        id: templateId,
        tenantId,
        eventType: 'loan_approved',
        channel: 'sms',
        version: 3,
        isActive: true,
      };
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue(template);

      const result = await service.findActiveTemplate(tenantId, 'loan_approved', 'sms');

      expect(mockPrisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          eventType: 'loan_approved',
          channel: 'sms',
          isActive: true,
          deletedAt: null,
        },
        orderBy: { version: 'desc' },
      });
      expect(result).toEqual(template);
    });
  });
});
