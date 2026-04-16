import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ScanPrompt() {
  const { t } = useTranslation()

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-white px-6 relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      {/* APARU logotype */}
      <div className="mb-10">
        <span className="text-4xl font-extrabold tracking-tight text-aparu-brand">APARU</span>
      </div>

      <div className="flex flex-col items-center justify-center gap-8 max-w-sm mx-auto text-center">
        {/* QR scanner box */}
        <div className="relative flex h-48 w-48 items-center justify-center rounded-2xl bg-aparu-bgGray overflow-hidden">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-24 w-24 text-aparu-brand"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h4v4H3v-4zM3 3h4v4H3V3zM10 3h4v4h-4V3zM10 10h4v4h-4v-4zM3 17h4v4H3v-4zM10 17h4v4h-4v-4zM17 3h4v4h-4V3zM17 10h4v4h-4v-4zM17 17h4v4h-4v-4z" />
          </svg>
          {/* Scanning line */}
          <div
            className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent to-orange-400/20 border-b-2 border-aparu-brand rounded-t-2xl animate-pulse"
            style={{ animationDuration: '2s' }}
          />
          {/* Corner brackets */}
          <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-aparu-brand rounded-tl" />
          <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-aparu-brand rounded-tr" />
          <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-aparu-brand rounded-bl" />
          <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-aparu-brand rounded-br" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-aparu-textMain">
            {t('scan_prompt.title', 'Отсканируйте QR-код')}
          </h1>
          <p className="text-aparu-textMuted leading-relaxed">
            {t('scan_prompt.description', 'Чтобы заказать такси, наведите камеру на QR-код, расположенный на стойке')}
          </p>
        </div>
      </div>
    </div>
  )
}
