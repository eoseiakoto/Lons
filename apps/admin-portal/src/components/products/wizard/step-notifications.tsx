'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useAuth } from '@/lib/auth-context';

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
}

const EVENTS = [
  { value: 'APPROVED', label: 'Loan Approved' },
  { value: 'DISBURSED', label: 'Loan Disbursed' },
  { value: 'DUE', label: 'Payment Due' },
  { value: 'OVERDUE', label: 'Payment Overdue' },
];

const CHANNELS = [
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];

const TEMPLATE_PLACEHOLDERS: Record<string, string> = {
  APPROVED: 'Dear {{customer_name}}, your loan of {{currency}} {{amount}} has been approved. Ref: {{reference}}',
  DISBURSED: 'Dear {{customer_name}}, {{currency}} {{amount}} has been disbursed to your wallet. Ref: {{reference}}',
  DUE: 'Reminder: Your payment of {{currency}} {{amount}} is due on {{due_date}}. Ref: {{reference}}',
  OVERDUE: 'Alert: Your payment of {{currency}} {{amount}} is overdue since {{due_date}}. Please pay immediately. Ref: {{reference}}',
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

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

export function StepNotifications({ data, onChange, productId }: StepNotificationsProps) {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [loadedFromDb, setLoadedFromDb] = useState(false);

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
        (t: any) => ({
          event: dbToEvent[t.eventType] || t.eventType,
          channel: (dbToChannel[t.channel] || t.channel) as 'SMS' | 'EMAIL',
          template: t.templateBody,
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
    // If we have a productId and DB templates, attempt server-side delete
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

    // Auto-save to DB if we have productId and tenantId
    if (productId && tenantId) {
      const notif = { ...data.notifications[index], ...updates };
      const dbEventType = eventToDb[notif.event] || notif.event;
      const dbChannel = channelToDb[notif.channel] || notif.channel.toLowerCase();

      if (queryData?.notificationTemplates?.[index]) {
        // Update existing
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
        // Create new
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
      <h3 className="text-lg font-semibold text-white/80">Notification Templates</h3>
      <p className="text-sm text-white/40">
        Configure notification messages for loan lifecycle events. Use {'{{placeholders}}'} for dynamic values.
        {productId && (
          <span className="text-blue-400/70"> Templates are saved automatically.</span>
        )}
      </p>

      {queryLoading && (
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading saved templates...
        </div>
      )}

      <div className="space-y-4">
        {data.notifications.map((notif, idx) => (
          <div key={idx} className="glass p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Template {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeTemplate(idx)}
                className="text-white/30 hover:text-red-400 transition-colors"
                title="Remove template"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Event</label>
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
                <label className={labelCls}>Channel</label>
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
              <label className={labelCls}>Template Message</label>
              <textarea
                className="w-full glass-input text-sm"
                value={notif.template}
                onChange={(e) => updateNotificationTemplate(idx, { template: e.target.value })}
                rows={3}
                placeholder={TEMPLATE_PLACEHOLDERS[notif.event] || 'Enter notification template...'}
              />
              <p className="text-xs text-white/30 mt-1">
                Available: {'{{customer_name}}'}, {'{{amount}}'}, {'{{currency}}'}, {'{{reference}}'}, {'{{due_date}}'}
              </p>
            </div>
          </div>
        ))}

        {data.notifications.length === 0 && (
          <div className="glass p-8 text-center">
            <p className="text-white/40 text-sm">No notification templates configured yet.</p>
            <p className="text-white/30 text-xs mt-1">Add templates to notify customers about loan events.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={addTemplate}
        className="glass-button flex items-center gap-2 text-sm"
      >
        <Plus className="w-4 h-4" />
        Add Template
      </button>
    </div>
  );
}
