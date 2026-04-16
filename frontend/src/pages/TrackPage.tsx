import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ordersApi } from '../api/orders'
import { useOrderStore } from '../stores/orderStore'
import { useWebSocket } from '../hooks/useWebSocket'
import Map from '../components/Map'
import StatusBar from '../components/StatusBar'

export default function TrackPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [error, setError] = useState(false)

  const currentOrder = useOrderStore(s => s.currentOrder)
  const driverLocation = useOrderStore(s => s.driverLocation)
  const etaSeconds = useOrderStore(s => s.etaSeconds)

  useEffect(() => {
    if (!token) return
    const fetchOrder = async () => {
      try {
        const data = await ordersApi.trackOrder(token)
        useOrderStore.setState({ currentOrder: data, estimatedPrice: data.estimated_price })
      } catch (e) {
        console.error('Failed to fetch tracking info', e)
        setError(true)
      }
    }
    fetchOrder()
  }, [token])

  const { isConnected, reconnectAttempts } = useWebSocket({
    orderId: currentOrder?.id ?? null,
    shareToken: token,
    enabled: !!currentOrder && !!token,
  })

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-white p-4">
        <div className="bg-white p-6 rounded-2xl border border-aparu-border text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-aparu-textMain mb-2">Ошибка доступа</h2>
          <p className="text-aparu-textMuted text-sm">Ссылка недействительна или срок её действия истёк.</p>
        </div>
      </div>
    )
  }

  if (!currentOrder) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="w-10 h-10 animate-spin rounded-full border-[3px] border-aparu-brand border-t-transparent" />
      </div>
    )
  }

  const mapCenter: [number, number] = currentOrder.point_a
    ? [currentOrder.point_a.lat, currentOrder.point_a.lng]
    : [49.9337, 82.6098]

  const markers = []
  if (currentOrder.point_a) {
    markers.push({ id: 'point_a', position: [currentOrder.point_a.lat, currentOrder.point_a.lng] as [number, number], hint: currentOrder.point_a.address })
  }
  if (currentOrder.point_b) {
    markers.push({ id: 'point_b', position: [currentOrder.point_b.lat, currentOrder.point_b.lng] as [number, number], hint: currentOrder.point_b.address })
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden relative">
      {!isConnected && reconnectAttempts > 0 && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 px-4 py-3 text-sm text-center font-semibold">
          {t('errors.websocket_disconnected')}
        </div>
      )}

      <div className="flex-1 relative z-0">
        <Map
          center={driverLocation || mapCenter}
          zoom={15}
          markers={markers}
          driverPosition={driverLocation || undefined}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-10 space-y-3 bg-gradient-to-t from-white/95 via-white/80 to-transparent pointer-events-none">
        <div className="flex flex-col gap-2">
          <div className="bg-aparu-textMain/80 backdrop-blur-md rounded-full px-4 py-2 text-center w-max mx-auto pointer-events-auto">
            <p className="text-xs font-medium text-white tracking-wide uppercase">{t('track.public_tracking')}</p>
          </div>
          <div className="pointer-events-auto rounded-xl overflow-hidden border border-aparu-border backdrop-blur-sm bg-white/95">
            <StatusBar status={currentOrder.status} etaSeconds={etaSeconds} updatedAt={currentOrder.updated_at} />
          </div>
        </div>
      </div>
    </div>
  )
}
