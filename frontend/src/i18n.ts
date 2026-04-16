/**
 * i18next initialization with Telegram/browser language detection.
 */
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

type TranslationDictionary = Record<string, unknown>

/**
 * Loads translation JSON from public/locales by language code.
 */
const loadTranslation = async (
  language: 'ru' | 'kz' | 'en' | 'zh',
): Promise<TranslationDictionary> => {
  const response = await fetch(`/locales/${language}/translation.json`)
  if (!response.ok) {
    throw new Error(
      `Failed to load translations for "${language}" (HTTP ${response.status}).`,
    )
  }
  return (await response.json()) as TranslationDictionary
}

/**
 * Initializes i18next and loads all locale dictionaries from public assets.
 */
const initializeI18n = async (): Promise<void> => {
  const [ruTranslation, kzTranslation, enTranslation, zhTranslation] = await Promise.all([
    loadTranslation('ru'),
    loadTranslation('kz'),
    loadTranslation('en'),
    loadTranslation('zh'),
  ])

  const resources: Record<string, { translation: TranslationDictionary }> = {
    ru: { translation: ruTranslation },
    kz: { translation: kzTranslation },
    en: { translation: enTranslation },
    zh: { translation: zhTranslation },
  }

  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'ru',
      supportedLngs: ['ru', 'kz', 'en', 'zh'],
      load: 'languageOnly',
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
      },
      react: {
        useSuspense: false,
      },
    })
}

export const i18nReady = initializeI18n()

export default i18n
