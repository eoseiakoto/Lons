export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return '***';
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-4);
  return `${prefix}***${suffix}`;
}

export function maskNationalId(nationalId: string): string {
  if (!nationalId || nationalId.length < 6) return '***-***-***';
  const parts = nationalId.split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-***-${parts[parts.length - 1].slice(-3)}`;
  }
  const prefix = nationalId.slice(0, 3);
  const suffix = nationalId.slice(-3);
  return `${prefix}-***-${suffix}`;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 2
    ? local.slice(0, 2) + '***'
    : '***';
  return `${maskedLocal}@${domain}`;
}

export function maskName(name: string): string {
  if (!name || name.length < 2) return '***';
  return name.charAt(0) + '***';
}
