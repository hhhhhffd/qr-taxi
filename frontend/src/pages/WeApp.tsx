import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '../stores/authStore'
import { useLocationStore } from '../stores/locationStore'
import { useOrderStore } from '../stores/orderStore'
import ToastContainer from '../components/ui/Toast'
import WechatPhoneSheet from '../components/WechatPhoneSheet'
import NotificationPermissionPrompt from '../components/NotificationPermissionPrompt'
import ScanPrompt from './ScanPrompt'
import OrderPage from './OrderPage'
import { useBrowserNotificationPrompt } from '../hooks/useBrowserNotifications'

const RidePage = lazy(() => import('./RidePage'))
const CompletedPage = lazy(() => import('./CompletedPage'))
const TrackPage = lazy(() => import('./TrackPage'))

/**
 * Entry point for the WeChat H5 platform (/we/ route prefix).
 *
 * On first load the user sees a WeChat-style phone-number authorization
 * bottom sheet.  Tapping «Разрешить» generates a fake Chinese number,
 * calls POST /api/auth/wechat, and proceeds to the regular taxi ordering
 * flow.  Tapping «Запретить» shows an explanatory screen.
 */
export default function WeApp() {
  const { t } = useTranslation()
  const loginWithWechat = useAuthStore((s) => s.loginWithWechat)
  const user = useAuthStore((s) => s.user)
  const checkActiveOrder = useOrderStore((s) => s.checkActiveOrder)
  const currentOrder = useOrderStore((s) => s.currentOrder)
  const fetchBySlug = useLocationStore((s) => s.fetchBySlug)

  const [showSheet, setShowSheet] = useState(false)
  const [denied, setDenied] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const {
    showPrompt: showNotificationPrompt,
    isRequesting: isNotificationRequesting,
    requestPermission,
    dismissPrompt,
  } = useBrowserNotificationPrompt()

  // Parse slug from query string (?slug=...)
  const slug = new URLSearchParams(window.location.search).get('slug')

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        if (!user) {
          // First visit — show WeChat phone sheet after a short delay
          // so the page renders before the overlay appears
          setTimeout(() => { if (mounted) setShowSheet(true) }, 400)
          return
        }
        // Already authenticated — resume session
        await checkActiveOrder().catch(() => null)
        if (slug && mounted) {
          await fetchBySlug(slug, 'ru').catch(() => null)
        }
      } finally {
        if (mounted) setIsInitializing(false)
      }
    }
    init()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleAllow = async (phone: string) => {
    setShowSheet(false)
    setIsInitializing(true)
    try {
      await loginWithWechat(phone)
      await checkActiveOrder().catch(() => null)
      if (slug) await fetchBySlug(slug, 'ru').catch(() => null)
    } catch (err) {
      console.error('WeChat login failed', err)
    } finally {
      setIsInitializing(false)
    }
  }

  const handleDeny = () => {
    setShowSheet(false)
    setDenied(true)
  }

  if (denied) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white px-8 text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">Доступ закрыт</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Для заказа такси необходимо поделиться номером телефона.
          Водитель свяжется с вами по этому номеру.
        </p>
        <button
          className="mt-8 w-full max-w-xs py-3.5 rounded-2xl font-semibold text-white"
          style={{ background: '#07C160' }}
          onClick={() => { setDenied(false); setShowSheet(true) }}
        >
          Попробовать снова
        </button>
      </div>
    )
  }

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        {t('app.loading')}
      </div>
    )
  }

  let RootComponent = <ScanPrompt />
  if (slug) {
    if (currentOrder) {
      RootComponent = <Navigate to={`/we/ride/${currentOrder.id}`} replace />
    } else {
      RootComponent = <OrderPage />
    }
  }

  return (
    <BrowserRouter basename="/we">
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[150] bg-gray-900 text-white px-4 py-2 text-sm text-center font-medium">
          {t('errors.offline')}
        </div>
      )}

      <ToastContainer />

      {!showSheet && showNotificationPrompt && (
        <NotificationPermissionPrompt
          onAllow={requestPermission}
          onLater={dismissPrompt}
          isRequesting={isNotificationRequesting}
        />
      )}

      {showSheet && (
        <WechatPhoneSheet onAllow={handleAllow} onDeny={handleDeny} />
      )}

      <Suspense fallback={<div className="flex h-screen items-center justify-center">{t('app.loading')}</div>}>
        <Routes>
          <Route path="/" element={RootComponent} />
          <Route path="/ride/:id" element={<RidePage />} />
          <Route path="/completed/:id" element={<CompletedPage />} />
          <Route path="/track/:token" element={<TrackPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
