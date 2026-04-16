import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { currentPlatform } from './hooks/usePlatform'
import { useAuthStore } from './stores/authStore'
import { useOrderStore } from './stores/orderStore'
import { useLocationStore } from './stores/locationStore'
import { useTelegram } from './hooks/useTelegram'
import { useLanguage } from './hooks/useLanguage'
import ToastContainer from './components/ui/Toast'
import NotificationPermissionPrompt from './components/NotificationPermissionPrompt'
import { useBrowserNotificationPrompt } from './hooks/useBrowserNotifications'

import ScanPrompt from './pages/ScanPrompt'
import Onboarding from './pages/Onboarding'
import OrderPage from './pages/OrderPage'
import WebLogin from './pages/WebLogin'

const RidePage = lazy(() => import('./pages/RidePage'))
const CompletedPage = lazy(() => import('./pages/CompletedPage'))
const TrackPage = lazy(() => import('./pages/TrackPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const WeApp = lazy(() => import('./pages/WeApp'))

/**
 * Root component — dispatches to the correct platform sub-app.
 *
 * - /we/* → WeApp (WeChat H5, rendered by WeApp which uses BrowserRouter basename="/we")
 * - Telegram platform → existing Telegram Mini App flow
 * - Web platform → OTP-based web login, then standard order flow
 */
export default function App() {
  const { t } = useTranslation()

  // WeChat H5: hand off to WeApp entirely — it manages its own router
  if (currentPlatform === 'wechat') {
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-500">{t('app.loading')}</div>}>
        <WeApp />
      </Suspense>
    )
  }

  // Telegram or Web — share the same BrowserRouter
  return <TelegramOrWebApp />
}

/** Shared shell for Telegram Mini App and plain browser users. */
function TelegramOrWebApp() {
  const { t } = useTranslation()
  const { initData, startParam } = useTelegram()
  const { language } = useLanguage()
  const loginWithTelegram = useAuthStore((s) => s.loginWithTelegram)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const user = useAuthStore((s) => s.user)

  const checkActiveOrder = useOrderStore((s) => s.checkActiveOrder)
  const currentOrder = useOrderStore((s) => s.currentOrder)
  const fetchBySlug = useLocationStore((s) => s.fetchBySlug)

  // For web: slug can come from ?slug= query param
  const querySlug = new URLSearchParams(window.location.search).get('slug')
  const effectiveStartParam = startParam || querySlug

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [isInitializing, setIsInitializing] = useState(true)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [needsWebLogin, setNeedsWebLogin] = useState(false)
  const {
    showPrompt: showNotificationPrompt,
    isRequesting: isNotificationRequesting,
    requestPermission,
    dismissPrompt,
  } = useBrowserNotificationPrompt()

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
    const initApp = async () => {
      try {
        if (initData) {
          // Telegram Mini App
          try {
            await loginWithTelegram(initData, language)
          } catch (e) {
            console.error('Login failed', e)
          }
        } else if (currentPlatform === 'web' && !isAuthenticated) {
          // Browser — need OTP login before proceeding
          if (mounted) setNeedsWebLogin(true)
          return
        } else if (isAuthenticated) {
          // Token exists but user not loaded yet (e.g. direct /admin navigation)
          await fetchMe()
        }

        if (mounted) {
          try { await checkActiveOrder() } catch { /* not logged in yet */ }
        }

        if (effectiveStartParam && mounted) {
          try { await fetchBySlug(effectiveStartParam, language) } catch { /* ok */ }
        }
      } catch (err) {
        console.error('App initialization error', err)
      } finally {
        if (mounted) setIsInitializing(false)
      }
    }

    initApp()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, language, effectiveStartParam])

  const handleWebLoginSuccess = async () => {
    setNeedsWebLogin(false)
    setIsInitializing(true)
    try {
      await checkActiveOrder().catch(() => null)
      if (effectiveStartParam) await fetchBySlug(effectiveStartParam, language).catch(() => null)
    } finally {
      setIsInitializing(false)
    }
  }

  if (isInitializing) {
    return <div className="flex h-screen items-center justify-center text-gray-500">{t('app.loading')}</div>
  }

  if (needsWebLogin) {
    return <WebLogin onSuccess={handleWebLoginSuccess} />
  }

  // Statuses that represent a live order the user should be tracking
  const ACTIVE_STATUSES = ['searching', 'driver_assigned', 'driver_arriving', 'driver_arrived', 'ride_started', 'no_drivers']

  // Determine root component — active order takes priority regardless of slug.
  // Terminal statuses (ride_completed, cancelled) must NOT redirect to RidePage
  // to avoid redirect loops and to allow seamless re-scanning.
  let RootComponent = <ScanPrompt />
  if (currentOrder && ACTIVE_STATUSES.includes(currentOrder.status)) {
    RootComponent = <Navigate to={`/ride/${currentOrder.id}`} replace />
  } else if (effectiveStartParam) {
    if (user && !user.onboarded) {
      RootComponent = <Onboarding />
    } else {
      RootComponent = <OrderPage />
    }
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[150] bg-gray-900 text-white px-4 py-2 text-sm text-center font-medium">
          {t('errors.offline')}
        </div>
      )}

      <ToastContainer />

      {showNotificationPrompt && (
        <NotificationPermissionPrompt
          onAllow={requestPermission}
          onLater={dismissPrompt}
          isRequesting={isNotificationRequesting}
        />
      )}

      <Suspense fallback={<div className="flex h-screen items-center justify-center">{t('app.loading')}</div>}>
        <Routes>
          <Route path="/" element={RootComponent} />
          <Route path="/ride/:id" element={<RidePage />} />
          <Route path="/completed/:id" element={<CompletedPage />} />
          <Route path="/track/:token" element={<TrackPage />} />
          <Route path="/admin/*" element={<AdminLayout />} />
          {/* WeChat H5 sub-app — all /we/* routes handled by WeApp's own BrowserRouter */}
          <Route path="/we/*" element={
            <Suspense fallback={null}>
              <WeApp />
            </Suspense>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
