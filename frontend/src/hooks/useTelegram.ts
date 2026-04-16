import { useEffect, useMemo } from 'react'

export interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

export interface TelegramThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  [key: string]: string | undefined
}

interface TelegramWebApp {
  initData?: string
  initDataUnsafe?: {
    start_param?: string
    user?: TelegramUser
  }
  version?: string
  themeParams: TelegramThemeParams
  ready: () => void
  expand: () => void
  /** Fires 'contactRequested' event — no callback arg. */
  requestContact?: () => void
  onEvent?: (eventType: string, handler: (event: unknown) => void) => void
  offEvent?: (eventType: string, handler: (event: unknown) => void) => void
  BackButton?: {
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
  }
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void
  showAlert?: (message: string, callback?: () => void) => void
  openLink?: (url: string) => void
}

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}

interface UseTelegramResult {
  webApp: TelegramWebApp | null
  initData: string | null
  startParam: string | null
  user: TelegramUser | null
  themeParams: TelegramThemeParams
}

/**
 * Returns Telegram WebApp object from the global window, if available.
 */
const getTelegramWebApp = (): TelegramWebApp | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const telegramWindow = window as TelegramWindow
  return telegramWindow.Telegram?.WebApp ?? null
}

/**
 * Applies Telegram theme parameters to CSS custom properties.
 */
const applyTelegramTheme = (themeParams: TelegramThemeParams): void => {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  Object.entries(themeParams).forEach(([key, value]) => {
    if (!value) {
      return
    }
    root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value)
  })
}

/**
 * Exposes Telegram Mini App context and applies theme/full-height setup.
 */
export const useTelegram = (): UseTelegramResult => {
  const webApp = useMemo(() => getTelegramWebApp(), [])

  useEffect(() => {
    if (!webApp) {
      return
    }
    webApp.ready()
    webApp.expand()
    applyTelegramTheme(webApp.themeParams)
  }, [webApp])

  const urlParams = new URLSearchParams(window.location.search)
  const queryStartApp = urlParams.get('startapp')
  const envStartParam = import.meta.env.VITE_MOCK_START_PARAM

  const startParam = webApp?.initDataUnsafe?.start_param || queryStartApp || envStartParam || null
  
  return {
    webApp,
    initData: webApp?.initData || null,
    startParam,
    user: webApp?.initDataUnsafe?.user ?? null,
    themeParams: webApp?.themeParams ?? {},
  }
}
