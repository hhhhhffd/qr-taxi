import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type SupportedLanguage = 'ru' | 'kz' | 'en' | 'zh'

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['ru', 'kz', 'en', 'zh']

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: {
          language_code?: string
        }
      }
    }
  }
}

export type { SupportedLanguage }

interface UseLanguageResult {
  language: SupportedLanguage
  supportedLanguages: SupportedLanguage[]
  switchLanguage: (language: SupportedLanguage) => Promise<void>
}

/**
 * Normalizes language code to supported app language.
 */
const normalizeLanguage = (lang: string | null | undefined): SupportedLanguage => {
  if (!lang) {
    return 'ru'
  }
  const base = lang.toLowerCase().split('-')[0]
  // Map zh-CN, zh-TW etc. → zh
  const normalized = base as SupportedLanguage
  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized
  }
  return 'ru'
}

/**
 * Detects preferred language via Telegram -> navigator -> Russian fallback.
 */
const detectPreferredLanguage = (): SupportedLanguage => {
  if (typeof window !== 'undefined') {
    const telegramWindow = window as TelegramWindow
    const telegramLang =
      telegramWindow.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
    if (telegramLang) {
      return normalizeLanguage(telegramLang)
    }
  }
  if (typeof navigator !== 'undefined') {
    return normalizeLanguage(navigator.language)
  }
  return 'ru'
}

/**
 * Syncs i18next language with Telegram/browser preference and exposes switcher.
 */
export const useLanguage = (): UseLanguageResult => {
  const { i18n } = useTranslation()

  useEffect(() => {
    // If the user has previously chosen a language, respect it and skip auto-detection.
    const stored = localStorage.getItem('i18nextLng')
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return
    }
    const detectedLanguage = detectPreferredLanguage()
    const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)
    if (currentLanguage !== detectedLanguage) {
      void i18n.changeLanguage(detectedLanguage)
    }
  }, [i18n])

  const switchLanguage = useCallback(
    async (language: SupportedLanguage): Promise<void> => {
      await i18n.changeLanguage(language)
    },
    [i18n],
  )

  return {
    language: normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
    supportedLanguages: SUPPORTED_LANGUAGES,
    switchLanguage,
  }
}
