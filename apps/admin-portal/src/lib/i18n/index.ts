// Re-exported from a leaf module to keep `i18n-context.tsx` out of the
// barrel cycle. See `./constants.ts` and Docs/DE-NOTE-i18n-circular-import.md.
export { SUPPORTED_LOCALES, type LocaleCode, DEFAULT_LOCALE } from './constants';
import { type LocaleCode, DEFAULT_LOCALE } from './constants';

// Lazy-load locale files
const localeLoaders: Record<LocaleCode, () => Promise<Record<string, unknown>>> = {
  en: () => import('./locales/en.json').then((m) => m.default),
  fr: () => import('./locales/fr.json').then((m) => m.default),
  es: () => import('./locales/es.json').then((m) => m.default),
  pt: () => import('./locales/pt.json').then((m) => m.default),
  ar: () => import('./locales/ar.json').then((m) => m.default),
  sw: () => import('./locales/sw.json').then((m) => m.default),
  ha: () => import('./locales/ha.json').then((m) => m.default),
};

// Cache loaded translations
const translationCache = new Map<string, Record<string, unknown>>();

export async function loadTranslations(locale: LocaleCode): Promise<Record<string, unknown>> {
  if (translationCache.has(locale)) {
    return translationCache.get(locale)!;
  }

  const loader = localeLoaders[locale];
  if (!loader) {
    const fallback = await localeLoaders[DEFAULT_LOCALE]();
    return fallback;
  }

  const translations = await loader();
  translationCache.set(locale, translations);
  return translations;
}

export { I18nProvider, useI18n } from './i18n-context';

// Get nested value from object by dot-separated key path
export function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return path; // Return key path as fallback
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : path;
}
