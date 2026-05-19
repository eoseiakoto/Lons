/**
 * Locale constants extracted out of `./index` to break the
 * `index.ts ↔ i18n-context.tsx` circular import that crashed the
 * portal on full-page refresh with:
 *
 *   ReferenceError: Cannot access 'DEFAULT_LOCALE' before initialization
 *
 * See `Docs/DE-NOTE-i18n-circular-import.md` for the trace. By owning
 * these values in a leaf module with no imports back into the cycle,
 * `i18n-context.tsx` can read them at module-init time without hitting
 * the temporal dead zone for the bindings inside `index.ts`.
 */

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English (United States)', flag: '🇺🇸' },
  { code: 'fr', label: 'Français (France)', flag: '🇫🇷' },
  { code: 'es', label: 'Español (España)', flag: '🇪🇸' },
  { code: 'pt', label: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'sw', label: 'Kiswahili (Afrika Mashariki)', flag: '🇰🇪' },
  { code: 'ha', label: 'Hausa (Nijeriya)', flag: '🇳🇬' },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'en';
