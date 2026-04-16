import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useOrderStore } from '../stores/orderStore'
import RatingModal from '../components/RatingModal'
import { formatPrice } from '../utils/price'
import { useTelegram } from '../hooks/useTelegram'
import { currentPlatform } from '../hooks/usePlatform'

const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=kz.aparu.aparupassenger&hl=ru&pli=1'
const IOS_APP_URL = 'https://apps.apple.com/kz/app/aparu-%D0%BB%D1%83%D1%87%D1%88%D0%B5-%D1%87%D0%B5%D0%BC-%D1%82%D0%B0%D0%BA%D1%81%D0%B8/id997499904'

const resolveInstallUrl = (): string => {
  if (typeof navigator === 'undefined') {
    return ANDROID_APP_URL
  }

  const ua = navigator.userAgent
  const isAndroid = /Android/i.test(ua)
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOS) {
    return IOS_APP_URL
  }
  if (isAndroid) {
    return ANDROID_APP_URL
  }
  return ANDROID_APP_URL
}

export default function CompletedPage() {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { webApp } = useTelegram()

  const order = useOrderStore(s => s.currentOrder)
  const rateOrder = useOrderStore(s => s.rateOrder)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showRating, setShowRating] = useState(true)
  const shouldShowInstallPrompt = currentPlatform === 'wechat' || currentPlatform === 'web'
  const [showInstallPrompt, setShowInstallPrompt] = useState(shouldShowInstallPrompt)
  const installAppUrl = resolveInstallUrl()

  useEffect(() => {
    if (!order || order.id !== orderId) navigate('/', { replace: true })
    if (webApp && webApp.BackButton) webApp.BackButton.hide()
  }, [order, orderId, navigate, webApp])

  if (!order) return null

  const handleRate = async (rating: number, comment: string) => {
    try {
      setIsSubmitting(true)
      await rateOrder(orderId, rating, comment)
      setShowRating(false)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white relative">
      <div className="flex-1 overflow-y-auto px-5 pb-32 pt-5">

        {/* Success header */}
        <div className="text-center mt-8 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-aparu-textMain">{t('completed.title')}</h1>
          <p className="text-aparu-textMuted mt-2">{t('completed.thanks')}</p>
        </div>

        {/* Route card */}
        <div className="bg-white rounded-2xl p-5 border border-aparu-border mb-6">
          <div className="flex gap-3 items-start">
            <div className="mt-1.5 w-5 flex flex-col items-center">
              <div className="w-3.5 h-3.5 rounded-full bg-aparu-brand border-2 border-orange-100" />
              {order.point_b && <div className="w-0.5 h-8 bg-aparu-border my-1 rounded-full" />}
              {order.point_b && <div className="w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-green-100" />}
            </div>
            <div className="flex flex-col flex-1 gap-4">
              <div>
                <span className="text-xs font-semibold text-aparu-textMuted uppercase tracking-wider">
                  {t('order.point_a')}
                </span>
                <p className="font-medium text-aparu-textMain line-clamp-2 leading-snug">{order.point_a.address}</p>
              </div>
              {order.point_b && (
                <div>
                  <span className="text-xs font-semibold text-aparu-textMuted uppercase tracking-wider">
                    {t('order.point_b')}
                  </span>
                  <p className="font-medium text-aparu-textMain line-clamp-2 leading-snug">{order.point_b.address}</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-aparu-border my-5" />

          <div className="flex justify-between items-center">
            <span className="text-aparu-textMuted font-medium">{t('completed.final_price')}</span>
            <span className="text-3xl font-extrabold text-aparu-textMain">{formatPrice(order.final_price)}</span>
          </div>
        </div>

      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 bg-white border-t border-aparu-border pb-safe pt-3 z-40">
        <button
          onClick={() => navigate('/', { replace: true })}
          className="w-full bg-aparu-brand text-white font-bold py-4 rounded-md active:opacity-80 transition-opacity"
        >
          {t('completed.order_again')}
        </button>
      </div>

      {showRating && (
        <RatingModal
          onSubmit={handleRate}
          isSubmitting={isSubmitting}
          onSkip={() => setShowRating(false)}
        />
      )}

      {showInstallPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/30 p-4 flex items-center justify-center">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-aparu-border shadow-2xl p-5">
            <div>
              <h3 className="text-lg font-bold text-aparu-textMain">
                {t('completed.app_prompt_title')}
              </h3>
              <p className="text-sm text-aparu-textMuted mt-1">
                {t('completed.app_prompt_subtitle')}
              </p>
            </div>

            <div className="mt-4">
              <a
                href={installAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-black text-white rounded-md py-3 text-center font-semibold active:opacity-80 transition-opacity"
              >
                {t('completed.app_prompt_download')}
              </a>
            </div>

            <button
              onClick={() => setShowInstallPrompt(false)}
              className="w-full mt-2 py-1.5 text-xs text-gray-500 font-medium"
            >
              {t('completed.app_prompt_later')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
