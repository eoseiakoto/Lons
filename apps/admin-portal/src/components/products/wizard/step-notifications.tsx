'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';
import { StepErrorBanner } from './field-error';
import type { FieldWarning } from './validation';

interface NotificationTemplate {
  event: string;
  channel: 'SMS' | 'EMAIL';
  template: string;
}

interface StepNotificationsProps {
  data: {
    notifications: NotificationTemplate[];
  };
  onChange: (updates: { notifications: NotificationTemplate[] }) => void;
  productId?: string;
  errors?: import('./validation').FieldError[];
  warnings?: FieldWarning[];
}

const TEMPLATE_KEYS: Record<string, string> = {
  APPROVED: 'products.wizard.notifications.template.approved',
  DISBURSED: 'products.wizard.notifications.template.disbursed',
  DUE: 'products.wizard.notifications.template.reminder',
  OVERDUE: 'products.wizard.notifications.template.overdue',
};

const GET_TEMPLATES = gql`
  query GetNotificationTemplates($tenantId: String!, $productId: String) {
    notificationTemplates(tenantId: $tenantId, productId: $productId) {
      id
      eventType
      channel
      templateBody
    }
  }
`;

const CREATE_TEMPLATE = gql`
  mutation CreateNotificationTemplate($input: CreateNotificationTemplateInput!, $idempotencyKey: String) {
    createNotificationTemplate(input: $input, idempotencyKey: $idempotencyKey) {
      id
      eventType
      channel
      templateBody
    }
  }
`;

const UPDATE_TEMPLATE = gql`
  mutation UpdateNotificationTemplate($id: ID!, $input: UpdateNotificationTemplateInput!) {
    updateNotificationTemplate(id: $id, input: $input) {
      id
      eventType
      channel
      templateBody
      version
    }
  }
`;

const DELETE_TEMPLATE = gql`
  mutation DeleteNotificationTemplate($id: ID!, $tenantId: String!) {
    deleteNotificationTemplate(id: $id, tenantId: $tenantId) {
      id
    }
  }
`;

/** Map UI event values to DB event types and back */
const eventToDb: Record<string, string> = {
  APPROVED: 'loan_approved',
  DISBURSED: 'disbursement_completed',
  DUE: 'repayment_reminder',
  OVERDUE: 'overdue_notice',
};
const dbToEvent: Record<string, string> = Object.fromEntries(
  Object.entries(eventToDb).map(([k, v]) => [v, k]),
);

const channelToDb: Record<string, string> = { SMS: 'sms', EMAIL: 'email' };
const dbToChannel: Record<string, string> = { sms: 'SMS', email: 'EMAIL' };

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

export function StepNotifications({ data, onChange, productId, errors = [], warnings = [] }: StepNotificationsProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const tenantId = user?.tenantId;
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  const EVENTS = [
    { value: 'APPROVED', label: t('products.wizard.loanApproved') },
    { value: 'DISBURSED', label: t('products.wizard.loanDisbursed') },
    { value: 'DUE', label: t('products.wizard.paymentDue') },
    { value: 'OVERDUE', label: t('products.wizard.paymentOverdue') },
  ];

  const CHANNELS = [
    { value: 'SMS', label: t('products.wizard.notifications.channel.sms') },
    { value: 'EMAIL', label: t('products.wizard.notifications.channel.email') },
  ];

  // Only query when we have a productId (existing product)
  const { data: queryData, loading: queryLoading } = useQuery(GET_TEMPLATES, {
    variables: { tenantId: tenantId || '', productId },
    skip: !tenantId || !productId,
    fetchPolicy: 'network-only',
  });

  const [createTemplate] = useMutation(CREATE_TEMPLATE);
  const [updateTemplate] = useMutation(UPDATE_TEMPLATE);
  const [deleteTemplate] = useMutation(DELETE_TEMPLATE);

  // Load templates from DB on mount for existing products
  useEffect(() => {
    if (queryData?.notificationTemplates && !loadedFromDb && productId) {
      const dbTemplates: NotificationTemplate[] = queryData.notificationTemplates.map(
        (tpl: any) => ({
          event: dbToEvent[tpl.eventType] || tpl.eventType,
          channel: (dbToChannel[tpl.channel] || tpl.channel) as 'SMS' | 'EMAIL',
          template: tpl.templateBody,
        }),
      );
      if (dbTemplates.length > 0) {
        onChange({ notifications: dbTemplates });
      }
      setLoadedFromDb(true);
    }
  }, [queryData, loadedFromDb, productId, onChange]);

  const addTemplate = () => {
    onChange({
      notifications: [
        ...data.notifications,
        { event: 'APPROVED', channel: 'SMS', template: '' },
      ],
    });
  };

  const removeTemplate = async (index: number) => {
    if (productId && tenantId && queryData?.notificationTemplates?.[index]) {
      const dbTemplate = queryData.notificationTemplates[index];
      try {
        await deleteTemplate({
          variables: { id: dbTemplate.id, tenantId },
        });
      } catch {
        // Continue with local removal even if server delete fails
      }
    }
    onChange({
      notifications: data.notifications.filter((_, i) => i !== index),
    });
  };

  const updateNotificationTemplate = (index: number, updates: Partial<NotificationTemplate>) => {
    const updated = data.notifications.map((n, i) =>
      i === index ? { ...n, ...updates } : n,
    );
    onChange({ notifications: updated });

    if (productId && tenantId) {
      const notif = { ...data.notifications[index], ...updates };
      const dbEventType = eventToDb[notif.event] || notif.event;
      const dbChannel = channelToDb[notif.channel] || notif.channel.toLowerCase();

      if (queryData?.notificationTemplates?.[index]) {
        const dbTemplate = queryData.notificationTemplates[index];
        updateTemplate({
          variables: {
            id: dbTemplate.id,
            input: {
              tenantId,
              eventType: dbEventType,
              channel: dbChannel,
              templateBody: notif.template,
            },
          },
        }).catch(() => {});
      } else if (notif.template) {
        createTemplate({
          variables: {
            input: {
              tenantId,
              productId,
              eventType: dbEventType,
              channel: dbChannel,
              templateBody: notif.template,
            },
            idempotencyKey: `tpl-${productId}-${dbEventType}-${dbChannel}-${Date.now()}`,
          },
        }).catch(() => {});
      }
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.notificationsTitle')}</h3>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      {warnings.length > 0 && (
        <div className="bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)] rounded-lg p-3 mb-4">
          {warnings.map((w, idx) => (
            <p key={idx} className="text-sm text-[color:var(--status-warning-text)]">{t(w.messageKey, w.params)}</p>
          ))}
        </div>
      )}

      <p className="text-sm text-[color:var(--text-tertiary)]">
        {t('products.wizard.notificationsDesc')}
        {productId && (
          <span className="text-[color:var(--accent-primary-deep)]/70"> {t('products.wizard.templatesSavedAuto')}</span>
        )}
      </p>

      {queryLoading && (
        <div className="flex items-center gap-2 text-[color:var(--text-tertiary)] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('products.wizard.loadingTemplates')}
        </div>
      )}

      <div className="space-y-4">
        {data.notifications.map((notif, idx) => {
          const isDuplicate = errors.some((e) => e.field === `notifications.${idx}`);
          return (
          <div key={idx} className={`card p-4 space-y-3 ${isDuplicate ? 'border-[color:var(--status-error)]' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[color:var(--text-primary)]">
                {t('products.wizard.template')} {idx + 1}
                {isDuplicate && <span className="text-xs text-[color:var(--status-error-text)] ml-2">{t('validation.duplicateNotification', { event: notif.event, channel: notif.channel })}</span>}
              </span>
              <button
                type="button"
                onClick={() => removeTemplate(idx)}
                className="text-[color:var(--text-tertiary)] hover:text-[color:var(--status-error-text)] transition-colors"
                title={t('products.wizard.removeTemplate')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('products.wizard.event')}</label>
                <select
                  className="w-full glass-input"
                  value={notif.event}
                  onChange={(e) => updateNotificationTemplate(idx, { event: e.target.value })}
                >
                  {EVENTS.map((ev) => (
                    <option key={ev.value} value={ev.value}>{ev.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('products.wizard.channel')}</label>
                <select
                  className="w-full glass-input"
                  value={notif.channel}
                  onChange={(e) => updateNotificationTemplate(idx, { channel: e.target.value as 'SMS' | 'EMAIL' })}
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('products.wizard.templateMessage')}</label>
              <textarea
                className="w-full glass-input text-sm"
                value={notif.template}
                onChange={(e) => updateNotificationTemplate(idx, { template: e.target.value })}
                rows={3}
                placeholder={TEMPLATE_KEYS[notif.event] ? t(TEMPLATE_KEYS[notif.event]) : ''}
              />
              <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
                {t('products.wizard.availablePlaceholders')}
              </p>
            </div>
          </div>
          );
        })}

        {data.notifications.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-[color:var(--text-tertiary)] text-sm">{t('products.wizard.noTemplatesYet')}</p>
            <p className="text-[color:var(--text-tertiary)] text-xs mt-1">{t('products.wizard.noTemplatesHint')}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={addTemplate}
        className="glass-button flex items-center gap-2 text-sm"
      >
        <Plus className="w-4 h-4" />
        {t('products.wizard.addTemplate')}
      </button>
    </div>
  );
}
