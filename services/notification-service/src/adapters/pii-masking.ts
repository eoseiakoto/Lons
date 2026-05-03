import { maskPhone, maskEmail } from '@lons/common';

/**
 * Picks the right mask for a notification recipient based on the channel.
 *   - phone-based (sms, whatsapp, voice) → `+233***7890`
 *   - email-based (email)                → `e***@gmail.com`
 *   - everything else (push tokens, in-app IDs) → first 4 chars + `***`
 *
 * Used by every notification adapter when logging delivery so no cleartext
 * recipient ever lands in stdout / log shippers / observability backends.
 */
export function maskNotificationRecipient(channel: string, recipient: string): string {
  const ch = channel.toLowerCase();
  if (ch === 'sms' || ch === 'whatsapp' || ch === 'voice') return maskPhone(recipient);
  if (ch === 'email') return maskEmail(recipient);
  if (recipient.length <= 4) return '***';
  return `${recipient.slice(0, 4)}***`;
}
