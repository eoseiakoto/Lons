/**
 * PII Masking Utilities
 * Masks sensitive personally identifiable information for logging and display
 * per CLAUDE.md security requirements
 */

/**
 * Mask a phone number (e.g., "+233245678901" -> "+233***7890")
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const sanitized = String(phone).trim();
  if (sanitized.length < 4) return sanitized;
  const firstPart = sanitized.slice(0, -4);
  const lastPart = sanitized.slice(-4);
  return `${firstPart}***${lastPart}`;
}

/**
 * Mask an email address (e.g., "john.doe@gmail.com" -> "j***@gmail.com")
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const sanitized = String(email).trim();
  const parts = sanitized.split('@');
  if (parts.length !== 2) return sanitized;

  const [name, domain] = parts;
  if (name.length === 0) return sanitized;

  const first = name[0];
  return `${first}***@${domain}`;
}

/**
 * Mask a national ID (e.g., "GHA-123456789-X" -> "GHA-***-XXX")
 */
export function maskNationalId(id: string | null | undefined): string {
  if (!id) return '';
  const sanitized = String(id).trim();
  if (sanitized.length < 3) return sanitized;

  // For format like "GHA-123456789-X", preserve first and last parts
  const parts = sanitized.split('-');
  if (parts.length >= 3) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first}-***-${last}`;
  }

  // Fallback: mask middle
  const first = sanitized[0];
  const last = sanitized[sanitized.length - 1];
  return `${first}***${last}`;
}

/**
 * Mask any generic string for PII purposes
 */
export function maskGeneric(value: string | null | undefined): string {
  if (!value) return '';
  const sanitized = String(value).trim();
  if (sanitized.length === 0) return '';
  const first = sanitized[0];
  return `${first}***`;
}

/**
 * Object that masks PII fields for safe logging
 */
export function maskPII(data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object') return data;

  const masked: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!value) {
      masked[key] = value;
      continue;
    }

    // Mask sensitive fields
    if (key.includes('phone') || key.includes('Phone')) {
      masked[key] = maskPhone(value);
    } else if (key.includes('email') || key.includes('Email')) {
      masked[key] = maskEmail(value);
    } else if (key.includes('nationalId') || key.includes('national_id') || key.includes('idNumber')) {
      masked[key] = maskNationalId(value);
    } else if (key.includes('password') || key.includes('secret') || key.includes('token')) {
      masked[key] = '***REDACTED***';
    } else {
      // Recursively mask nested objects
      if (typeof value === 'object' && !Array.isArray(value)) {
        masked[key] = maskPII(value);
      } else {
        masked[key] = value;
      }
    }
  }

  return masked;
}
