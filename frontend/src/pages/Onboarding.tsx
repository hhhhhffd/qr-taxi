import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTelegram } from '../hooks/useTelegram'

const slides = [
  {
    key: 'slide1',
    icon: (
      <svg className="w-20 h-20 text-aparu-brand" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 64 64">
        <rect x="8" y="32" width="48" height="16" rx="4"/>
        <path d="M12 32l6-10h28l6 10"/>
        <path d="M18 22l2-5h16l2 5"/>
        <circle cx="18" cy="46" r="4"/>
        <circle cx="46" cy="46" r="4"/>
      </svg>
    ),
  },
  {
    key: 'slide2',
    icon: (
      <svg className="w-20 h-20 text-aparu-brand" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 64 64">
        <rect x="18" y="8" width="28" height="48" rx="4"/>
        <rect x="24" y="14" width="16" height="24" rx="2"/>
        <circle cx="32" cy="46" r="2.5"/>
        <path d="M26 8h12"/>
      </svg>
    ),
  },
  {
    key: 'slide3',
    icon: (
      <svg className="w-20 h-20 text-aparu-brand" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 64 64">
        <path d="M20 32a12 12 0 1124 0"/>
        <path d="M12 48s2-8 8-10M52 48s-2-8-8-10M32 32v12M28 40l4 4 4-4"/>
      </svg>
    ),
  },
]

export default function Onboarding() {
  const { t } = useTranslation()
  const { webApp } = useTelegram()
  const [slideIndex, setSlideIndex] = useState(0)

  const user = useAuthStore((s) => s.user)
  const requestPhone = useAuthStore((s) => s.requestPhone)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  if (user && user.onboarded) return <Navigate to="/" replace />

  const slideData = [
    {
      title: t('onboarding.slide1.title', 'Добро пожаловать в APARU'),
      description: t('onboarding.slide1.description', 'Быстрый заказ такси прямо на месте.'),
    },
    {
      title: t('onboarding.slide2.title', 'Сканируйте и едьте'),
      description: t('onboarding.slide2.description', 'Никаких долгих ожиданий. Машина приедет к указанному месту.'),
    },
    {
      title: t('onboarding.slide3.title', 'Остался один шаг'),
      description: t('onboarding.slide3.description', 'Поделитесь номером телефона для связи с водителем.'),
    },
  ]

  const pollOnboardingState = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 700))
      const updated = await fetchMe().catch(() => null)
      if (updated?.onboarded) return true
    }
    return false
  }

  const handleRequestContact = () => {
    if (webApp && webApp.requestContact) {
      try {
        let handled = false
        let fallbackTimer: number | null = null
        const stopListening = (handler: (event: unknown) => void) => {
          if (webApp.offEvent) {
            webApp.offEvent('contactRequested', handler)
          }
        }
        const clearFallbackTimer = () => {
          if (fallbackTimer !== null) {
            window.clearTimeout(fallbackTimer)
            fallbackTimer = null
          }
        }

        const onContact = async (event: unknown) => {
          if (handled) return

          const e = event as { status?: string; contact?: { phone_number?: string } }
          if (e.status && e.status !== 'sent') {
            handled = true
            clearFallbackTimer()
            stopListening(onContact)
            return
          }

          handled = true
          clearFallbackTimer()
          stopListening(onContact)

          if (e.contact?.phone_number) {
            try {
              await requestPhone(e.contact.phone_number)
              return
            } catch {
              // Continue with /auth/me polling if Telegram didn't pass phone in the event payload.
            }
          }

          await pollOnboardingState()
        }

        if (webApp.onEvent) {
          webApp.onEvent('contactRequested', onContact)
        }

        webApp.requestContact()

        // Some Telegram clients never fire contactRequested event.
        fallbackTimer = window.setTimeout(() => {
          fallbackTimer = null
          if (handled) return
          pollOnboardingState()
            .then((isOnboarded) => {
              if (isOnboarded && !handled) {
                handled = true
                stopListening(onContact)
              }
            })
            .catch(console.error)
        }, 1200)

        return
      } catch (err) {
        console.warn('requestContact not supported or failed', err)
      }
    }
    const phone = prompt(t('onboarding.prompt_phone'))
    if (phone) requestPhone(phone).catch(console.error)
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* APARU logotype */}
      <div className="flex justify-center pt-10 pb-2">
        <span className="text-2xl font-extrabold tracking-tight text-aparu-brand">APARU</span>
      </div>

      {/* Slides */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${slideIndex * 100}%)` }}
        >
          {slideData.map((slide, idx) => (
            <div
              key={idx}
              className="w-full h-full flex-shrink-0 flex flex-col items-center justify-center px-8 text-center gap-6"
            >
              <div className="w-32 h-32 rounded-full bg-orange-50 flex items-center justify-center">
                {slides[idx].icon}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-aparu-textMain mb-3">{slide.title}</h2>
                <p className="text-aparu-textMuted leading-relaxed">{slide.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dots + Buttons */}
      <div className="px-6 pb-safe pt-4">
        <div className="flex justify-center gap-2 mb-8">
          {slideData.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSlideIndex(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === slideIndex ? 'w-8 bg-aparu-brand' : 'w-2 bg-aparu-border'
              }`}
            />
          ))}
        </div>

        {slideIndex < slideData.length - 1 ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setSlideIndex(slideIndex + 1)}
              className="w-full bg-aparu-brand text-white font-semibold rounded-md py-4"
            >
              {t('common.next', 'Далее')}
            </button>
            <button
              onClick={() => setSlideIndex(slideData.length - 1)}
              className="w-full text-aparu-textMuted font-medium py-3"
            >
              {t('common.skip', 'Пропустить')}
            </button>
          </div>
        ) : (
          <button
            onClick={handleRequestContact}
            className="w-full bg-aparu-brand text-white font-semibold rounded-md py-4"
          >
            {t('onboarding.share_contact', 'Поделиться контактом')}
          </button>
        )}
      </div>
    </div>
  )
}
