'use client';

import { useState } from 'react';

interface NpsWidgetProps {
  tenantId: string;
  userId: string;
  graphqlUrl?: string;
}

export function NpsWidget({ tenantId, userId, graphqlUrl = '/api/graphql' }: NpsWidgetProps) {
  const [dismissed, setDismissed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (dismissed || submitted) return null;

  const handleSubmit = async () => {
    if (selectedScore === null) return;
    setSubmitting(true);

    try {
      await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation SubmitSurvey($tenantId: String!, $userId: String!, $score: Int!, $comment: String) {
            submitSurveyResponse(tenantId: $tenantId, userId: $userId, score: $score, comment: $comment) {
              id
            }
          }`,
          variables: { tenantId, userId, score: selectedScore, comment: comment || null },
        }),
      });
      setSubmitted(true);
    } catch {
      // Silently fail — survey is non-critical
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-20 right-6 z-40 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Quick Feedback</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>

      <p className="mb-3 text-xs text-gray-600">
        How likely are you to recommend Lons to another institution?
      </p>

      <div className="mb-3 flex gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelectedScore(i)}
            className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors ${
              selectedScore === i
                ? i <= 6
                  ? 'bg-red-500 text-white'
                  : i <= 8
                    ? 'bg-yellow-500 text-white'
                    : 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {i}
          </button>
        ))}
      </div>

      <div className="mb-2 flex justify-between text-[10px] text-gray-400">
        <span>Not likely</span>
        <span>Very likely</span>
      </div>

      {selectedScore !== null && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any additional feedback? (optional)"
            className="mb-2 w-full rounded border border-gray-200 p-2 text-xs focus:border-blue-300 focus:outline-none"
            rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </>
      )}
    </div>
  );
}
