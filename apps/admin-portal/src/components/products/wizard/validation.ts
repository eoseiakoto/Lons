import type { ProductFormState } from './product-wizard';

export interface FieldError {
  field: string;
  messageKey: string;
  /** Optional interpolation params for i18n */
  params?: Record<string, string | number>;
  /**
   * Optional interpolation params whose values are themselves i18n keys.
   * The consumer translates each value via t() before merging into `params`
   * for the final t(messageKey, ...) call. Use this when a validation message
   * needs to embed another translated label (e.g. "Must be greater than {{field}}"
   * where {{field}} should display "Minimum Amount" in the user's locale).
   */
  paramKeys?: Record<string, string>;
}

export interface FieldWarning {
  field: string;
  /** i18n key for the warning message */
  messageKey: string;
  /** Optional interpolation params */
  params?: Record<string, string | number>;
  severity: 'warning';
}

export interface StepValidationResult {
  valid: boolean;
  errors: FieldError[];
  warnings?: FieldWarning[];
}

// ─── Step 1: Basic Info ───────────────────────────────────────────
export function validateBasicInfo(
  data: Pick<ProductFormState, 'name' | 'description' | 'type' | 'currency'>,
): StepValidationResult {
  const errors: FieldError[] = [];

  if (!data.name.trim()) {
    errors.push({ field: 'name', messageKey: 'validation.required' });
  } else if (data.name.trim().length < 3) {
    errors.push({ field: 'name', messageKey: 'validation.minLength', params: { min: 3 } });
  } else if (data.name.trim().length > 255) {
    errors.push({ field: 'name', messageKey: 'validation.maxLength', params: { max: 255 } });
  }

  if (!data.type) {
    errors.push({ field: 'type', messageKey: 'validation.required' });
  }

  if (!data.currency) {
    errors.push({ field: 'currency', messageKey: 'validation.required' });
  }

  if (data.description && data.description.length > 2000) {
    errors.push({ field: 'description', messageKey: 'validation.maxLength', params: { max: 2000 } });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Step 2: Financial Terms ──────────────────────────────────────
export function validateFinancialTerms(
  data: Pick<
    ProductFormState,
    'minAmount' | 'maxAmount' | 'minTenorDays' | 'maxTenorDays' | 'interestRateModel' | 'interestRate' | 'repaymentMethod' | 'gracePeriodDays' | 'coolingOffHours'
  >,
): StepValidationResult {
  const errors: FieldError[] = [];

  const minAmt = data.minAmount ? Number(data.minAmount) : null;
  const maxAmt = data.maxAmount ? Number(data.maxAmount) : null;
  const minTenor = data.minTenorDays ? Number(data.minTenorDays) : null;
  const maxTenor = data.maxTenorDays ? Number(data.maxTenorDays) : null;
  const interestRate = data.interestRate ? Number(data.interestRate) : null;
  const gracePeriod = data.gracePeriodDays ? Number(data.gracePeriodDays) : null;

  // ── Required fields ──
  if (!data.minAmount || !data.minAmount.trim()) {
    errors.push({ field: 'minAmount', messageKey: 'validation.required' });
  } else if (isNaN(minAmt!) || minAmt! < 0) {
    errors.push({ field: 'minAmount', messageKey: 'validation.minValue', params: { min: 0 } });
  }

  if (!data.maxAmount || !data.maxAmount.trim()) {
    errors.push({ field: 'maxAmount', messageKey: 'validation.required' });
  } else if (isNaN(maxAmt!) || maxAmt! <= 0) {
    errors.push({ field: 'maxAmount', messageKey: 'validation.greaterThanZero' });
  }

  // Cross-field: min < max (only when both are valid numbers)
  if (minAmt !== null && maxAmt !== null && !isNaN(minAmt) && !isNaN(maxAmt) && minAmt >= maxAmt) {
    errors.push({
      field: 'maxAmount',
      messageKey: 'validation.mustBeGreaterThan',
      paramKeys: { field: 'products.wizard.validation.fieldMinAmount' },
    });
  }

  if (!data.minTenorDays || !data.minTenorDays.trim()) {
    errors.push({ field: 'minTenorDays', messageKey: 'validation.required' });
  } else if (isNaN(minTenor!) || minTenor! < 1 || !Number.isInteger(minTenor)) {
    errors.push({ field: 'minTenorDays', messageKey: 'validation.minIntValue', params: { min: 1 } });
  }

  if (!data.maxTenorDays || !data.maxTenorDays.trim()) {
    errors.push({ field: 'maxTenorDays', messageKey: 'validation.required' });
  } else if (isNaN(maxTenor!) || maxTenor! < 1 || !Number.isInteger(maxTenor)) {
    errors.push({ field: 'maxTenorDays', messageKey: 'validation.minIntValue', params: { min: 1 } });
  }

  // Cross-field: min tenor < max tenor
  if (minTenor !== null && maxTenor !== null && !isNaN(minTenor) && !isNaN(maxTenor) && minTenor >= maxTenor) {
    errors.push({
      field: 'maxTenorDays',
      messageKey: 'validation.mustBeGreaterThan',
      paramKeys: { field: 'products.wizard.validation.fieldMinTenor' },
    });
  }

  // Interest rate — required
  if (!data.interestRate || !data.interestRate.trim()) {
    errors.push({ field: 'interestRate', messageKey: 'validation.required' });
  } else if (isNaN(interestRate!) || interestRate! < 0) {
    errors.push({ field: 'interestRate', messageKey: 'validation.minValue', params: { min: 0 } });
  } else if (interestRate! > 100) {
    errors.push({ field: 'interestRate', messageKey: 'validation.maxValue', params: { max: 100 } });
  }

  if (!data.interestRateModel) {
    errors.push({ field: 'interestRateModel', messageKey: 'validation.required' });
  }

  if (!data.repaymentMethod) {
    errors.push({ field: 'repaymentMethod', messageKey: 'validation.required' });
  }

  // Grace period — optional but must be valid if provided
  if (gracePeriod !== null && (isNaN(gracePeriod) || gracePeriod < 0 || !Number.isInteger(gracePeriod))) {
    errors.push({ field: 'gracePeriodDays', messageKey: 'validation.minIntValue', params: { min: 0 } });
  }

  // Grace period must be shorter than minimum tenor
  if (gracePeriod !== null && minTenor !== null && !isNaN(gracePeriod) && !isNaN(minTenor) && gracePeriod > 0 && minTenor > 0 && gracePeriod >= minTenor) {
    errors.push({ field: 'gracePeriodDays', messageKey: 'validation.gracePeriodExceedsTenor' });
  }

  // Cooling-off hours — optional but must be a non-negative integer if provided
  const coolingOff = data.coolingOffHours ? Number(data.coolingOffHours) : null;
  if (coolingOff !== null && (isNaN(coolingOff) || coolingOff < 0 || !Number.isInteger(coolingOff))) {
    errors.push({ field: 'coolingOffHours', messageKey: 'validation.minIntValue', params: { min: 0 } });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Step 3: Fees ─────────────────────────────────────────────────
function validateFee(
  fee: { type: 'FLAT' | 'PERCENTAGE'; amount: string },
  fieldPrefix: string,
  required: boolean,
): FieldError[] {
  const errors: FieldError[] = [];
  const isEmpty = !fee.amount || fee.amount.trim() === '' || fee.amount.trim() === '0';

  if (isEmpty) {
    if (required) {
      errors.push({ field: `${fieldPrefix}.amount`, messageKey: 'validation.required' });
    }
    return errors;
  }

  const val = Number(fee.amount);
  if (isNaN(val)) {
    errors.push({ field: `${fieldPrefix}.amount`, messageKey: 'validation.invalidNumber' });
  } else if (val < 0) {
    errors.push({ field: `${fieldPrefix}.amount`, messageKey: 'validation.minValue', params: { min: 0 } });
  } else if (fee.type === 'PERCENTAGE' && val > 100) {
    errors.push({ field: `${fieldPrefix}.amount`, messageKey: 'validation.percentageMax' });
  }
  return errors;
}

export function validateFees(
  data: Pick<ProductFormState, 'originationFee' | 'serviceFee' | 'latePenalty' | 'insurance'>,
): StepValidationResult {
  const errors: FieldError[] = [
    ...validateFee(data.originationFee, 'originationFee', true),   // required
    ...validateFee(data.serviceFee, 'serviceFee', false),           // optional
    ...validateFee(data.latePenalty, 'latePenalty', true),           // required
    ...validateFee(data.insurance, 'insurance', false),             // optional
  ];
  return { valid: errors.length === 0, errors };
}

// ─── Step 4: Eligibility ──────────────────────────────────────────
export function validateEligibility(
  data: Pick<ProductFormState, 'minCreditScore' | 'minKycLevel' | 'maxActiveLoans' | 'customRules'>,
): StepValidationResult {
  const errors: FieldError[] = [];

  if (data.minCreditScore) {
    const score = Number(data.minCreditScore);
    if (isNaN(score) || score < 0 || score > 1000) {
      errors.push({ field: 'minCreditScore', messageKey: 'validation.range', params: { min: 0, max: 1000 } });
    }
  }

  // Max active loans — required
  if (!data.maxActiveLoans || !data.maxActiveLoans.trim()) {
    errors.push({ field: 'maxActiveLoans', messageKey: 'validation.required' });
  } else {
    const val = Number(data.maxActiveLoans);
    if (isNaN(val) || val < 1 || !Number.isInteger(val)) {
      errors.push({ field: 'maxActiveLoans', messageKey: 'validation.minIntValue', params: { min: 1 } });
    } else if (val > 50) {
      errors.push({ field: 'maxActiveLoans', messageKey: 'validation.maxValue', params: { max: 50 } });
    }
  }

  if (data.customRules && data.customRules.trim()) {
    try {
      const parsed = JSON.parse(data.customRules);
      if (!Array.isArray(parsed)) {
        errors.push({ field: 'customRules', messageKey: 'validation.mustBeJsonArray' });
      }
    } catch {
      errors.push({ field: 'customRules', messageKey: 'validation.invalidJson' });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Step 5: Funding Source ───────────────────────────────────────
export function validateFundingSource(
  data: Pick<ProductFormState, 'lenderId' | 'insuranceEnabled' | 'insuranceProvider' | 'insurancePremiumRate' | 'insuranceCoverageType' | 'revenueSharing'>,
): StepValidationResult {
  const errors: FieldError[] = [];

  // If insurance is enabled, validate its sub-fields
  if (data.insuranceEnabled) {
    if (!data.insuranceProvider || !data.insuranceProvider.trim()) {
      errors.push({ field: 'insuranceProvider', messageKey: 'validation.required' });
    }

    if (!data.insurancePremiumRate || !data.insurancePremiumRate.trim()) {
      errors.push({ field: 'insurancePremiumRate', messageKey: 'validation.required' });
    } else {
      const rate = Number(data.insurancePremiumRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        errors.push({ field: 'insurancePremiumRate', messageKey: 'validation.range', params: { min: 0, max: 100 } });
      }
    }

    if (!data.insuranceCoverageType) {
      errors.push({ field: 'insuranceCoverageType', messageKey: 'validation.required' });
    }
  }

  // Revenue sharing: lender share must be valid if provided
  if (data.revenueSharing.lenderSharePercent && data.revenueSharing.lenderSharePercent.trim()) {
    const val = Number(data.revenueSharing.lenderSharePercent);
    if (isNaN(val) || val < 0 || val > 100) {
      errors.push({ field: 'revenueSharing.lenderSharePercent', messageKey: 'validation.range', params: { min: 0, max: 100 } });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Step 6: Approval ─────────────────────────────────────────────
export function validateApproval(
  data: Pick<ProductFormState, 'approvalWorkflow' | 'autoApproveThreshold' | 'slaHours'>,
): StepValidationResult {
  const errors: FieldError[] = [];

  if (!data.approvalWorkflow) {
    errors.push({ field: 'approvalWorkflow', messageKey: 'validation.required' });
  }

  // Auto-approve threshold — required for AUTO and HYBRID workflows
  const showThreshold = data.approvalWorkflow === 'AUTO' || data.approvalWorkflow === 'HYBRID';
  if (showThreshold) {
    if (!data.autoApproveThreshold || !data.autoApproveThreshold.trim()) {
      errors.push({ field: 'autoApproveThreshold', messageKey: 'validation.required' });
    } else {
      const val = Number(data.autoApproveThreshold);
      if (isNaN(val) || val < 0 || val > 1000) {
        errors.push({ field: 'autoApproveThreshold', messageKey: 'validation.range', params: { min: 0, max: 1000 } });
      }
    }
  }

  // SLA hours — required
  if (!data.slaHours || !data.slaHours.trim()) {
    errors.push({ field: 'slaHours', messageKey: 'validation.required' });
  } else {
    const val = Number(data.slaHours);
    if (isNaN(val) || val < 1 || val > 720) {
      errors.push({ field: 'slaHours', messageKey: 'validation.range', params: { min: 1, max: 720 } });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Step 7: Notifications ────────────────────────────────────────
const RECOMMENDED_EVENTS = ['APPROVED', 'DISBURSED', 'DUE', 'OVERDUE'];

export function validateNotifications(
  data: Pick<ProductFormState, 'notifications'>,
): StepValidationResult {
  const errors: FieldError[] = [];
  const warnings: FieldWarning[] = [];

  // Check for duplicate event+channel combinations
  const seen = new Set<string>();
  data.notifications.forEach((n, idx) => {
    const key = `${n.event}-${n.channel}`;
    if (seen.has(key)) {
      errors.push({
        field: `notifications.${idx}`,
        messageKey: 'validation.duplicateNotification',
        params: { event: n.event, channel: n.channel },
      });
    }
    seen.add(key);
  });

  // Warn about missing recommended notification templates
  const configuredEvents = data.notifications.map(n => n.event);
  const missingEvents = RECOMMENDED_EVENTS.filter(e => !configuredEvents.includes(e));
  if (missingEvents.length > 0) {
    warnings.push({
      field: 'notifications',
      messageKey: 'products.wizard.validation.missingTemplates',
      params: { events: missingEvents.join(', ') },
      severity: 'warning',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Pre-Activation Validation (all required fields for going live) ───
export function validateForActivation(
  form: ProductFormState,
  generatedCode: string,
): StepValidationResult {
  const errors: FieldError[] = [];

  // Required core fields beyond per-step validation
  if (!generatedCode && !form.code) {
    errors.push({ field: 'code', messageKey: 'validation.requiredForActivation' });
  }

  // Run ALL per-step validations
  const step1 = validateBasicInfo(form);
  const step2 = validateFinancialTerms(form);
  const step3 = validateFees(form);
  const step4 = validateEligibility(form);
  const step5 = validateFundingSource(form);
  const step6 = validateApproval(form);
  const step7 = validateNotifications(form);

  const allErrors = [
    ...errors,
    ...step1.errors,
    ...step2.errors,
    ...step3.errors,
    ...step4.errors,
    ...step5.errors,
    ...step6.errors,
    ...step7.errors,
  ];
  return { valid: allErrors.length === 0, errors: allErrors };
}

// ─── Validate ALL steps at once (for edit-mode Save Changes) ─────
export function validateAllSteps(form: ProductFormState): { step: number; result: StepValidationResult } | null {
  for (let step = 1; step <= 7; step++) {
    const result = validateStep(step, form);
    if (!result.valid) {
      return { step, result };
    }
  }
  return null; // all valid
}

// ─── Validate a specific step ─────────────────────────────────────
export function validateStep(step: number, form: ProductFormState): StepValidationResult {
  switch (step) {
    case 1:
      return validateBasicInfo(form);
    case 2:
      return validateFinancialTerms(form);
    case 3:
      return validateFees(form);
    case 4:
      return validateEligibility(form);
    case 5:
      return validateFundingSource(form);
    case 6:
      return validateApproval(form);
    case 7:
      return validateNotifications(form);
    case 8:
      // Review step — no input validation needed (it's read-only)
      return { valid: true, errors: [] };
    default:
      return { valid: true, errors: [] };
  }
}

// ─── Helper: get error for a specific field ───────────────────────
export function getFieldError(errors: FieldError[], field: string): FieldError | undefined {
  return errors.find((e) => e.field === field);
}

export function hasFieldError(errors: FieldError[], field: string): boolean {
  return errors.some((e) => e.field === field);
}
