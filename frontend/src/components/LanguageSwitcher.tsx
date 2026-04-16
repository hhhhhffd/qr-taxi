import { useTranslation } from 'react-i18next'
import { useLanguage } from '../hooks/useLanguage'

export default function LanguageSwitcher() {
  const { language, supportedLanguages, switchLanguage } = useLanguage()
  const { t } = useTranslation()

  return (
    <div className="flex gap-1 bg-white/80 backdrop-blur rounded-full px-2 py-1 shadow-sm">
      {supportedLanguages.map((lang) => (
        <button
          key={lang}
          onClick={() => void switchLanguage(lang)}
          className={`text-sm font-medium px-2 py-1 rounded-full transition-colors ${
            language === lang
              ? 'bg-aparu-brand text-white'
              : 'text-aparu-textMuted hover:bg-aparu-bgGray'
          }`}
        >
          {t(`language.${lang}`)}
        </button>
      ))}
    </div>
  )
}
