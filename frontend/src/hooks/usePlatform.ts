/**
 * Detects the current runtime platform.
 *
 * Decision order:
 * 1. Telegram WebApp object present in window → 'telegram'
 * 2. WeChat built-in browser UA marker     → 'wechat'
 * 3. Everything else                       → 'web'
 */

export type Platform = 'telegram' | 'wechat' | 'web'

/**
 * Synchronously detects the platform from the global window object.
 * Safe to call during module initialisation (before React mounts).
 */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'web'

  // Telegram Mini App injects window.Telegram.WebApp
  const twa = (window as Window & { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp
  if (twa?.initData) return 'telegram'

  // WeChat browser always includes MicroMessenger in the UA
  if (navigator.userAgent.includes('MicroMessenger')) return 'wechat'

  return 'web'
}

/** Cached at module load — the platform never changes mid-session. */
export const currentPlatform: Platform = detectPlatform()
