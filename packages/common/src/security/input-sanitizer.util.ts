/**
 * XSS sanitization utilities.
 *
 * Strips <script> tags, inline event handlers, javascript: URIs, and
 * data: URIs from string values so that user input cannot inject
 * executable content into HTML output.
 */

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const INLINE_EVENT_QUOTED_RE = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const INLINE_EVENT_UNQUOTED_RE = /\s*on\w+\s*=\s*[^\s>]*/gi;
const JAVASCRIPT_URI_RE = /javascript\s*:/gi;
const DATA_URI_ATTR_RE = /(src|href)\s*=\s*["']?\s*data:/gi;

export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return input;

  let sanitized = input;
  sanitized = sanitized.replace(SCRIPT_TAG_RE, '');
  sanitized = sanitized.replace(INLINE_EVENT_QUOTED_RE, '');
  sanitized = sanitized.replace(INLINE_EVENT_UNQUOTED_RE, '');
  sanitized = sanitized.replace(JAVASCRIPT_URI_RE, '');
  sanitized = sanitized.replace(DATA_URI_ATTR_RE, '$1=data_blocked:');

  return sanitized;
}

export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  fields?: (keyof T & string)[],
): T {
  const result = { ...obj };
  const keysToSanitize = fields ?? (Object.keys(result) as (keyof T & string)[]);

  for (const key of keysToSanitize) {
    if (typeof result[key] === 'string') {
      (result as any)[key] = sanitizeInput(result[key] as string);
    }
  }

  return result;
}
