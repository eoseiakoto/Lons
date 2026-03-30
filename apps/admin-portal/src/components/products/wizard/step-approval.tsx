'use client';

interface StepApprovalProps {
  data: {
    approvalWorkflow: string;
    autoApproveThreshold: string;
    slaHours: string;
  };
  onChange: (updates: Partial<StepApprovalProps['data']>) => void;
}

const WORKFLOW_TYPES = [
  { value: 'AUTO', label: 'Automatic', description: 'Loans are auto-approved if credit score meets the threshold' },
  { value: 'MANUAL', label: 'Manual', description: 'All loans require manual review by an operator' },
  { value: 'HYBRID', label: 'Hybrid', description: 'Auto-approve above threshold, manual review below' },
];

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

export function StepApproval({ data, onChange }: StepApprovalProps) {
  const showThreshold = data.approvalWorkflow === 'AUTO' || data.approvalWorkflow === 'HYBRID';

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white/80">Approval Workflow</h3>
      <p className="text-sm text-white/40">Configure how loan requests are evaluated and approved.</p>

      <div className="space-y-3">
        {WORKFLOW_TYPES.map((wf) => (
          <label
            key={wf.value}
            className={`glass p-4 flex items-start gap-4 cursor-pointer transition-all duration-200 ${
              data.approvalWorkflow === wf.value
                ? 'border-blue-400/50 bg-blue-500/5'
                : 'hover:bg-white/5'
            }`}
          >
            <input
              type="radio"
              name="approvalWorkflow"
              value={wf.value}
              checked={data.approvalWorkflow === wf.value}
              onChange={(e) => onChange({ approvalWorkflow: e.target.value })}
              className="mt-1 accent-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-white">{wf.label}</span>
              <p className="text-xs text-white/40 mt-0.5">{wf.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="glass p-4 space-y-4">
        <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">Parameters</h4>
        <div className="grid grid-cols-2 gap-4">
          {showThreshold && (
            <div>
              <label className={labelCls}>Auto-Approve Threshold Score</label>
              <input
                type="number"
                min="0"
                max="1000"
                className="w-full glass-input"
                value={data.autoApproveThreshold}
                onChange={(e) => onChange({ autoApproveThreshold: e.target.value })}
                placeholder="e.g. 500"
              />
              <p className="text-xs text-white/30 mt-1">
                {data.approvalWorkflow === 'AUTO'
                  ? 'Score required for automatic approval'
                  : 'Scores above this are auto-approved; below go to manual review'}
              </p>
            </div>
          )}
          <div>
            <label className={labelCls}>SLA Hours</label>
            <input
              type="number"
              min="1"
              max="720"
              className="w-full glass-input"
              value={data.slaHours}
              onChange={(e) => onChange({ slaHours: e.target.value })}
              placeholder="e.g. 24"
            />
            <p className="text-xs text-white/30 mt-1">Maximum hours to process an application</p>
          </div>
        </div>
      </div>
    </div>
  );
}
