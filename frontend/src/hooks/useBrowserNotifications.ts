import { useCallback, useState } from 'react'

import i18n from '../i18n'
import type { OrderStatus } from '../types'
import { currentPlatform } from './usePlatform'

const PROMPT_DISMISSED_KEY = 'aparu_notifications_prompt_dismissed'

const isNotificationSupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window

const canUseBrowserNotifications = (): boolean =>
  currentPlatform === 'web' || currentPlatform === 'wechat'

const isPromptDismissed = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  return window.sessionStorage.getItem(PROMPT_DISMISSED_KEY) === '1'
}

const markPromptDismissed = (): void => {
  if (typeof window === 'undefined') {
    return
  }
  window.sessionStorage.setItem(PROMPT_DISMISSED_KEY, '1')
}

export const canSendBrowserNotifications = (): boolean =>
  canUseBrowserNotifications()
  && isNotificationSupported()
  && Notification.permission === 'granted'

export const sendOrderStatusNotification = (orderId: number, status: OrderStatus): void => {
  if (!canSendBrowserNotifications()) {
    return
  }

  const statusLabel = i18n.t(`status.${status}`)
  new Notification(i18n.t('notifications.title'), {
    body: i18n.t('notifications.order_status_changed', { status: statusLabel }),
    tag: `aparu-order-${orderId}`,
  })
}

interface BrowserNotificationPromptState {
  showPrompt: boolean
  isRequesting: boolean
  requestPermission: () => Promise<void>
  dismissPrompt: () => void
}

export const useBrowserNotificationPrompt = (): BrowserNotificationPromptState => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (
    isNotificationSupported() ? Notification.permission : 'unsupported'
  ))
  const [dismissed, setDismissed] = useState<boolean>(() => isPromptDismissed())
  const [isRequesting, setIsRequesting] = useState(false)

  const requestPermission = useCallback(async () => {
    if (!isNotificationSupported()) {
      return
    }

    setIsRequesting(true)
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      setDismissed(true)
      markPromptDismissed()
    } finally {
      setIsRequesting(false)
    }
  }, [])

  const dismissPrompt = useCallback(() => {
    setDismissed(true)
    markPromptDismissed()
  }, [])

  const showPrompt = canUseBrowserNotifications()
    && permission === 'default'
    && !dismissed

  return {
    showPrompt,
    isRequesting,
    requestPermission,
    dismissPrompt,
  }
}
