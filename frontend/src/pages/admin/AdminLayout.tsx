/**
 * AdminLayout — sidebar navigation wrapper for all admin pages.
 * Guards access: only users with is_admin=true may enter.
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useLanguage } from '../../hooks/useLanguage'
import { useAuthStore } from '../../stores/authStore'

const LocationsPage = lazy(() => import('./LocationsPage'))
const TariffsPage = lazy(() => import('./TariffsPage'))
const OrdersPage = lazy(() => import('./OrdersPage'))
const HeatmapPage = lazy(() => import('./HeatmapPage'))

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'aparu_admin_sidebar_collapsed'

const NAV_ITEMS = [
  { to: '/admin/locations', labelKey: 'admin.nav.locations' },
  { to: '/admin/tariffs', labelKey: 'admin.nav.tariffs' },
  { to: '/admin/orders', labelKey: 'admin.nav.orders' },
  { to: '/admin/heatmap', labelKey: 'admin.nav.analytics' },
] as const

function AdminLanguageSwitcher() {
  const { t } = useTranslation()
  const { language, supportedLanguages, switchLanguage } = useLanguage()

  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-[#121a28] p-1">
      {supportedLanguages.map((lang) => (
        <button
          key={lang}
          onClick={() => void switchLanguage(lang)}
          className={[
            'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
            language === lang
              ? 'bg-aparu-brand text-white'
              : 'text-slate-300 hover:bg-white/10 hover:text-white',
          ].join(' ')}
        >
          {t(`language.${lang}`)}
        </button>
      ))}
    </div>
  )
}

export default function AdminLayout() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === '1'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      isSidebarCollapsed ? '1' : '0',
    )
  }, [isSidebarCollapsed])

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />
  }

  if (!user.is_admin) {
    return <Navigate to="/" replace />
  }

  const sidebarToggleLabel = isSidebarCollapsed
    ? t('admin.actions.expand_sidebar')
    : t('admin.actions.collapse_sidebar')

  return (
    <div className="min-h-screen bg-[#0b1018] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] items-start">
        <aside
          className={[
            'hidden shrink-0 border-r border-white/10 bg-[#101828] transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto',
            isSidebarCollapsed ? 'w-24' : 'w-72',
          ].join(' ')}
        >
          <div
            className={[
              'border-b border-white/10',
              isSidebarCollapsed ? 'px-3 py-5' : 'px-6 py-6',
            ].join(' ')}
          >
            <div
              className={
                isSidebarCollapsed
                  ? 'flex flex-col items-center gap-3'
                  : 'flex items-start justify-between gap-3'
              }
            >
              <div className={isSidebarCollapsed ? 'text-center' : ''}>
                <p
                  className={[
                    'text-[11px] uppercase text-aparu-brand/90',
                    isSidebarCollapsed ? 'tracking-[0.16em]' : 'tracking-[0.22em]',
                  ].join(' ')}
                >
                  APARU
                </p>
                {!isSidebarCollapsed && (
                  <>
                    <h1 className="mt-2 text-xl font-bold text-white">{t('admin.title')}</h1>
                    <p className="mt-1 text-sm text-slate-400">{t('admin.subtitle')}</p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarToggleLabel}
                title={sidebarToggleLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0f1725] text-slate-300 transition-colors hover:border-white/20 hover:text-white"
              >
                <svg
                  className={[
                    'h-4 w-4 transition-transform',
                    isSidebarCollapsed ? '' : 'rotate-180',
                  ].join(' ')}
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12.5 5L7.5 10L12.5 15"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <nav className={['flex-1 space-y-1', isSidebarCollapsed ? 'p-2' : 'p-3'].join(' ')}>
            {NAV_ITEMS.map(({ to, labelKey }) => (
              <NavLink
                key={to}
                to={to}
                title={isSidebarCollapsed ? t(labelKey) : undefined}
                className={({ isActive }) =>
                  [
                    'flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors',
                    isSidebarCollapsed ? 'justify-center px-2' : 'px-4',
                    isActive
                      ? 'bg-aparu-brand text-white shadow-card'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white',
                  ].join(' ')
                }
              >
                {isSidebarCollapsed ? (
                  <span className="text-xs font-semibold uppercase">
                    {t(labelKey).slice(0, 1)}
                  </span>
                ) : (
                  t(labelKey)
                )}
              </NavLink>
            ))}
          </nav>

          <div
            className={[
              'border-t border-white/10 py-4',
              isSidebarCollapsed ? 'px-3' : 'px-6',
            ].join(' ')}
          >
            {isSidebarCollapsed ? (
              <p
                className="truncate text-center text-sm font-semibold text-white"
                title={user.first_name}
              >
                {user.first_name.slice(0, 1).toUpperCase()}
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-400">{t('admin.signed_in_as')}</p>
                <p className="truncate text-sm font-semibold text-white">{user.first_name}</p>
              </>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1018]/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <h2 className="text-base font-semibold text-white md:hidden">{t('admin.title')}</h2>
                <p className="hidden text-sm text-slate-400 md:block">{t('admin.header_hint')}</p>
              </div>
              <AdminLanguageSwitcher />
            </div>

            <div className="pb-3 pl-4 pr-4 sm:px-6 lg:px-8 md:hidden">
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {NAV_ITEMS.map(({ to, labelKey }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      [
                        'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        isActive
                          ? 'border-aparu-brand bg-aparu-brand text-white'
                          : 'border-white/20 text-slate-300 hover:border-white/40 hover:text-white',
                      ].join(' ')
                    }
                  >
                    {t(labelKey)}
                  </NavLink>
                ))}
              </div>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
                  {t('app.loading')}
                </div>
              }
            >
              <Routes>
                <Route index element={<Navigate to="locations" replace />} />
                <Route path="locations" element={<LocationsPage />} />
                <Route path="tariffs" element={<TariffsPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="heatmap" element={<HeatmapPage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
