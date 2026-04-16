import { useEffect, useMemo, useRef, useState } from 'react'

import { useOrderStore } from '../stores/orderStore'
import type { WsMessage } from '../types'
import { sendOrderStatusNotification } from './useBrowserNotifications'

const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

interface UseWebSocketOptions {
  orderId: number | null
  token?: string | null
  shareToken?: string | null
  enabled?: boolean
}

interface UseWebSocketState {
  isConnected: boolean
  reconnectAttempts: number
}

/**
 * Builds a WebSocket URL for private or public order tracking.
 */
const buildWebSocketUrl = (
  orderId: number,
  token?: string | null,
  shareToken?: string | null,
): string | null => {
  if (!token && !shareToken) {
    return null
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const params = new URLSearchParams()
  if (shareToken) {
    params.set('share_token', shareToken)
  } else if (token) {
    params.set('token', token)
  }

  return `${protocol}://${window.location.host}/ws/orders/${orderId}?${params.toString()}`
}

/**
 * Validates unknown payload as a known WebSocket message shape.
 */
const isWsMessage = (payload: unknown): payload is WsMessage => {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const type = (payload as { type?: unknown }).type
  return (
    type === 'status_update'
    || type === 'eta_update'
    || type === 'driver_location'
    || type === 'ping'
  )
}

/**
 * Parses incoming WebSocket JSON safely.
 */
const parseWsMessage = (rawData: unknown): WsMessage | null => {
  if (typeof rawData !== 'string') {
    return null
  }
  try {
    const parsed = JSON.parse(rawData) as unknown
    return isWsMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Connects to order WebSocket, reconnects automatically, and syncs order store.
 */
export const useWebSocket = ({
  orderId,
  token = null,
  shareToken = null,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketState => {
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const websocketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const isFirstStatusAfterReconnectRef = useRef(false)

  const updateFromWs = useOrderStore((state) => state.updateFromWs)

  const websocketUrl = useMemo(() => {
    if (!orderId || typeof window === 'undefined') {
      return null
    }
    return buildWebSocketUrl(orderId, token, shareToken)
  }, [orderId, token, shareToken])

  useEffect(() => {
    if (!enabled || !websocketUrl) {
      return
    }

    shouldReconnectRef.current = true
    reconnectAttemptsRef.current = 0
    setReconnectAttempts(0)
    setIsConnected(false)

    /**
     * Opens a socket connection and schedules retries on disconnect.
     */
    const connect = (): void => {
      if (!shouldReconnectRef.current) {
        return
      }

      const ws = new WebSocket(websocketUrl)
      websocketRef.current = ws

      ws.onopen = () => {
        const wasReconnect = reconnectAttemptsRef.current > 0
        isFirstStatusAfterReconnectRef.current = wasReconnect
        reconnectAttemptsRef.current = 0
        setReconnectAttempts(0)
        setIsConnected(true)
      }

      ws.onmessage = (event: MessageEvent) => {
        const message = parseWsMessage(event.data)
        if (!message || message.type === 'ping') {
          return
        }

        const overwrite =
          message.type === 'status_update'
          && isFirstStatusAfterReconnectRef.current

        if (message.type === 'status_update') {
          const previousStatus = useOrderStore.getState().currentOrder?.status ?? null
          if (!overwrite && previousStatus !== null && previousStatus !== message.status) {
            sendOrderStatusNotification(message.order_id, message.status)
          }
          isFirstStatusAfterReconnectRef.current = false
        }

        void updateFromWs(message, {
          overwrite,
          shareToken: shareToken ?? undefined,
        })
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onclose = () => {
        setIsConnected(false)

        if (!shouldReconnectRef.current) {
          return
        }
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          return
        }

        reconnectAttemptsRef.current += 1
        setReconnectAttempts(reconnectAttemptsRef.current)
        reconnectTimerRef.current = window.setTimeout(() => {
          connect()
        }, RECONNECT_INTERVAL_MS)
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      websocketRef.current?.close()
      websocketRef.current = null
    }
  }, [enabled, websocketUrl, shareToken, updateFromWs])

  return { isConnected, reconnectAttempts }
}
