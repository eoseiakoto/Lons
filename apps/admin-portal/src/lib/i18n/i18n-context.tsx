'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Constants live in a leaf module with no imports back here, so reading
// `DEFAULT_LOCALE` on line ~17 inside `createContext({...})` no longer
// hits a temporal-dead-zone error when the bundler resolves the
// `index.ts ↔ i18n-context.tsx` cycle. See Docs/DE-NOTE-i18n-circular-import.md.
import { type LocaleCode, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './constants';
// The remaining cycle on `loadTranslations` and `getNestedValue` is
// safe — both are function declarations (hoisted), so they're available
// even while `index.ts` is mid-evaluation.
import { loadTranslations, getNestedValue } from './index';

// Eagerly import English so first render is instant (static import — restart dev server if keys change)
import enTranslations from './locales/en.json';

interface I18nContextType {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key: string) => key,
  isRTL: false,
});

const RTL_LOCALES: LocaleCode[] = ['ar'];

const STORAGE_KEY = 'lons-locale';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [translations, setTranslations] = useState<Record<string, unknown>>(
    enTranslations as unknown as Record<string, unknown>,
  );

  // Load saved locale on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
    if (saved && SUPPORTED_LOCALES.some((l) => l.code === saved)) {
      setLocaleState(saved);
      loadTranslations(saved).then(setTranslations);
    }
  }, []);

  const setLocale = useCallback(async (newLocale: LocaleCode) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    const loaded = await loadTranslations(newLocale);
    setTranslations(loaded);

    // Update HTML lang attribute and direction
    document.documentElement.lang = newLocale;
    document.documentElement.dir = RTL_LOCALES.includes(newLocale) ? 'rtl' : 'ltr';
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const interpolate = (raw: string): string => {
        if (!params) return raw;
        let result = raw;
        for (const [paramKey, paramValue] of Object.entries(params)) {
          result = result.replace(
            new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'),
            String(paramValue),
          );
        }
        return result;
      };

      // 1. Lookup in current locale.
      const currentValue = getNestedValue(translations, key);
      if (currentValue !== key) {
        return interpolate(currentValue);
      }

      // 2. Fallback to English when the current locale is not English.
      if (locale !== DEFAULT_LOCALE) {
        const englishValue = getNestedValue(
          enTranslations as unknown as Record<string, unknown>,
          key,
        );
        if (englishValue !== key) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(
              `[i18n] Missing key "${key}" in locale "${locale}", falling back to en`,
            );
          }
          return interpolate(englishValue);
        }
      }

      // 3. Last resort: surface the raw key path so missing-everywhere bugs are visible.
      return key;
    },
    [translations, locale],
  );

  const isRTL = useMemo(() => RTL_LOCALES.includes(locale), [locale]);

  return React.createElement(
    I18nContext.Provider,
    { value: { locale, setLocale, t, isRTL } },
    children,
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
