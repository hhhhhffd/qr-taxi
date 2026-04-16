import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OrderStatus } from '../types'

interface StatusBarProps {
  status: OrderStatus
  etaSeconds?: number | null
  updatedAt: string
}

export default function StatusBar({ status, etaSeconds, updatedAt }: StatusBarProps) {
  const { t } = useTranslation()
  const [elapsedWait, setElapsedWait] = useState(0)
  const [localEta, setLocalEta] = useState<number | null>(etaSeconds ?? null)

  useEffect(() => {
    setLocalEta(etaSeconds ?? null)
  }, [etaSeconds])

  useEffect(() => {
    let interval: number | undefined
    if (status === 'driver_arriving' && localEta !== null && localEta > 0) {
      interval = window.setInterval(() => {
        setLocalEta((prev) => (prev && prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return () => { if (interval !== undefined) clearInterval(interval) }
  }, [status, localEta])

  useEffect(() => {
    let interval: number | undefined
    if (status === 'driver_arrived' || status === 'ride_started') {
      const startMs = new Date(updatedAt).getTime()
      interval = window.setInterval(() => {
        const diff = Math.floor((Date.now() - startMs) / 1000)
        setElapsedWait(diff > 0 ? diff : 0)
      }, 1000)
    }
    return () => { if (interval !== undefined) clearInterval(interval) }
  }, [status, updatedAt])

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  let content = null

  switch (status) {
    case 'searching':
      content = (
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-aparu-brand border-t-transparent shrink-0" />
          <span className="font-medium text-lg text-aparu-textMain">{t('status.searching')}</span>
        </div>
      )
      break
    case 'driver_assigned':
      content = (
        <div className="flex flex-col">
          <span className="font-medium text-lg text-aparu-textMain">{t('status.driver_assigned')}</span>
          {etaSeconds != null && (
            <span className="text-aparu-textMuted text-sm">
              {t('ride.eta', { minutes: Math.max(1, Math.ceil(etaSeconds / 60)) })}
            </span>
          )}
        </div>
      )
      break
    case 'driver_arriving':
      content = (
        <div className="flex flex-col">
          <span className="font-medium text-lg text-aparu-brand">{t('status.driver_arriving')}</span>
          {localEta != null && (
            <span className="text-aparu-textMuted text-sm font-medium">
              Через {formatTime(localEta)}
            </span>
          )}
        </div>
      )
      break
    case 'driver_arrived':
      content = (
        <div className="flex flex-col">
          <span className="font-medium text-lg text-green-600">{t('status.driver_arrived')}</span>
          <span className="text-aparu-textMuted text-sm font-medium">
            Ожидание: {formatTime(elapsedWait)}
          </span>
        </div>
      )
      break
    case 'ride_started':
      content = (
        <div className="flex flex-col">
          <span className="font-medium text-lg text-aparu-textMain">{t('status.ride_started')}</span>
          <span className="text-aparu-textMuted text-sm font-medium">
            В пути: {formatTime(elapsedWait)}
          </span>
        </div>
      )
      break
    case 'no_drivers':
      content = (
        <span className="font-medium text-lg text-red-500">{t('status.no_drivers')}</span>
      )
      break
    case 'cancelled':
      content = (
        <span className="font-medium text-lg text-red-500">{t('status.cancelled')}</span>
      )
      break
    case 'ride_completed':
      content = (
        <span className="font-medium text-lg text-green-600">{t('status.ride_completed')}</span>
      )
      break
    default:
      content = <span className="text-aparu-textMuted">{t('status.unknown')}</span>
  }

  return (
    <div className="bg-white rounded-xl border border-aparu-border p-4 w-full">
      {content}
    </div>
  )
}
