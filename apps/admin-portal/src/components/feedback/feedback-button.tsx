'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { gql, useMutation } from '@apollo/client';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';

const SUBMIT_FEEDBACK = gql`
  mutation SubmitFeedback($input: SubmitFeedbackInput!) {
    submitFeedback(input: $input) {
      id
      category
      severity
      status
    }
  }
`;

export function FeedbackButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('BUG');
  const [severity, setSeverity] = useState('MINOR');
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();

  const CATEGORIES = [
    { value: 'BUG', label: t('feedback.categories.bug') },
    { value: 'FEATURE_REQUEST', label: t('feedback.categories.featureRequest') },
    { value: 'UX_ISSUE', label: t('feedback.categories.uxIssue') },
    { value: 'INTEGRATION_QUESTION', label: t('feedback.categories.integrationQuestion') },
    { value: 'OTHER', label: t('feedback.categories.other') },
  ];

  const SEVERITIES = [
    { value: 'CRITICAL', label: t('feedback.severities.critical') },
    { value: 'MAJOR', label: t('feedback.severities.major') },
    { value: 'MINOR', label: t('feedback.severities.minor') },
    { value: 'SUGGESTION', label: t('feedback.severities.suggestion') },
  ];

  const [submitFeedback, { loading }] = useMutation(SUBMIT_FEEDBACK);

  const resetForm = () => {
    setCategory('BUG');
    setSeverity('MINOR');
    setDescription('');
    setScreenshotUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    try {
      await submitFeedback({
        variables: {
          input: {
            tenantId: user?.tenantId ?? '',
            userId: user?.userId ?? '',
            category,
            severity,
            description: description.trim(),
            screenshotUrl: screenshotUrl.trim() || undefined,
            pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
            debugContext: {
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
              timestamp: new Date().toISOString(),
            },
          },
        },
      });
      toast('success', t('feedback.submitSuccess'));
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast('error', `${t('feedback.submitFailed')} ${err.message ?? 'Unknown error'}`);
    }
  };

  return (
    <>
      {/* Edge-anchored vertical tab — flush right, rotated label */}
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-40 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white pl-2 pr-2.5 py-2 rounded-l-lg shadow-lg transition-all hover:shadow-indigo-500/30 origin-right"
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
        }}
        aria-label="Submit Feedback"
      >
        <MessageSquarePlus className="w-4 h-4 rotate-90" />
        <span className="text-xs font-medium tracking-wide">{t('feedback.title')}</span>
      </button>

      {/* Feedback Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={t('feedback.submitFeedback')} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('feedback.category')}</label>
            <select
              className="glass-input w-full text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('feedback.severity')}</label>
            <select
              className="glass-input w-full text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('common.description')} <span className="text-[color:var(--status-error-text)]">*</span>
            </label>
            <textarea
              className="glass-input w-full text-sm min-h-[120px] resize-y"
              placeholder={t('feedback.describeFeedback')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Screenshot URL */}
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('feedback.screenshotUrl')}</label>
            <input
              type="url"
              className="glass-input w-full text-sm"
              placeholder="https://..."
              value={screenshotUrl}
              onChange={(e) => setScreenshotUrl(e.target.value)}
            />
          </div>

          {/* Auto-captured info */}
          <div className="text-xs text-[color:var(--text-tertiary)]">
            {t('feedback.autoCaptureNote')}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="glass-button text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !description.trim()}
              className="glass-button-primary text-sm disabled:opacity-40"
            >
              {loading ? t('feedback.submitting') : t('feedback.submitFeedback')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
