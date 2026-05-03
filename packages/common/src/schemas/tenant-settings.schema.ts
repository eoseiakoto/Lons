import { z } from 'zod';

export const TenantSettingsSchema = z.object({
  // Regional & Locale
  defaultCurrency: z.string().length(3).default('GHS'),
  timezone: z.string().default('Africa/Accra'),
  locale: z.string().default('en'),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),

  // Business Operations
  businessHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
    end: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
    workDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  }).default({
    start: '08:00',
    end: '17:00',
    workDays: [1, 2, 3, 4, 5],
  }),

  // Settlement
  settlementFrequency: z.enum(['daily', 'weekly', 'monthly']).default('daily'),

  // Notification Channels
  notificationChannels: z.object({
    sms: z.boolean().default(true),
    email: z.boolean().default(true),
    push: z.boolean().default(false),
    inApp: z.boolean().default(true),
  }).default({
    sms: true,
    email: true,
    push: false,
    inApp: true,
  }),

  // Product Type Flags
  enabledProductTypes: z.object({
    overdraft: z.boolean().default(true),
    microLoan: z.boolean().default(true),
    bnpl: z.boolean().default(false),
    invoiceFactoring: z.boolean().default(false),
  }).default({
    overdraft: true,
    microLoan: true,
    bnpl: false,
    invoiceFactoring: false,
  }),

  // Branding
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
    logoUrl: z.string().url().optional().or(z.literal('')),
    portalTitle: z.string().max(100).optional(),
  }).default({
    primaryColor: '#3B82F6',
  }),

  // Regulatory
  regulatoryJurisdiction: z.string().max(100).optional(),
  dataResidencyRegion: z.string().max(50).optional(),

  // Exposure Rules
  exposureRules: z.object({
    maxCustomerExposure: z.string().default('0'),
    maxCustomerExposureMultiplier: z.number().default(0),
    enableCrossProductCheck: z.boolean().default(true),
  }).default({
    maxCustomerExposure: '0',
    maxCustomerExposureMultiplier: 0,
    enableCrossProductCheck: true,
  }),

  // Advanced overrides
  customOverrides: z.record(z.string(), z.unknown()).optional(),
});

export type TenantConfigSettings = z.infer<typeof TenantSettingsSchema>;

export const DEFAULT_TENANT_SETTINGS: TenantConfigSettings = TenantSettingsSchema.parse({});
