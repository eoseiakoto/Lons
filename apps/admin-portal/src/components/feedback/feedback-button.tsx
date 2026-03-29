'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { gql, useMutation } from '@apollo/client';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';

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

const CATEGORIES = [
  { value: 'BUG', label: 'Bug' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'UX_ISSUE', label: 'UX Issue' },
  { value: 'INTEGRATION_QUESTION', label: 'Integration Question' },
  { value: 'OTHER', label: 'Other' },
] as const;

const SEVERITIES = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'SUGGESTION', label: 'Suggestion' },
] as const;

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('BUG');
  const [severity, setSeverity] = useState('MINOR');
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();

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
      toast('success', 'Feedback submitted successfully. Thank you!');
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast('error', `Failed to submit feedback: ${err.message ?? 'Unknown error'}`);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 shadow-lg transition-all hover:shadow-indigo-500/25 hover:scale-105"
        aria-label="Submit Feedback"
      >
        <MessageSquarePlus className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:inline">Feedback</span>
      </button>

      {/* Feedback Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Submit Feedback" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm text-white/60 mb-1">Category</label>
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
            <label className="block text-sm text-white/60 mb-1">Severity</label>
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
            <label className="block text-sm text-white/60 mb-1">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              className="glass-input w-full text-sm min-h-[120px] resize-y"
              placeholder="Describe your feedback..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Screenshot URL */}
          <div>
            <label className="block text-sm text-white/60 mb-1">Screenshot URL</label>
            <input
              type="url"
              className="glass-input w-full text-sm"
              placeholder="https://..."
              value={screenshotUrl}
              onChange={(e) => setScreenshotUrl(e.target.value)}
            />
          </div>

          {/* Auto-captured info */}
          <div className="text-xs text-white/30">
            Current page URL and browser info will be captured automatically.
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="glass-button text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !description.trim()}
              className="glass-button-primary text-sm disabled:opacity-40"
            >
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
