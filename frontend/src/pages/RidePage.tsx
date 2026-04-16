import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useOrderStore } from '../stores/orderStore'
import { useLocationStore } from '../stores/locationStore'
import { useWebSocket } from '../hooks/useWebSocket'
import Map from '../components/Map'
import StatusBar from '../components/StatusBar'
import DriverCard from '../components/DriverCard'
import { ordersApi } from '../api/orders'
import { useAuthStore } from '../stores/authStore'
import { useTelegram } from '../hooks/useTelegram'
import { currentPlatform } from '../hooks/usePlatform'

export default function RidePage() {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { webApp } = useTelegram()
  const tgVersion = webApp?.version ? parseFloat(webApp.version) : 0
  const tgSupportsPopups = tgVersion >= 6.2

  const locationSlug = useLocationStore(s => s.location?.slug)
  const token = useAuthStore(s => s.token)
  const order = useOrderStore(s => s.currentOrder)
  const cancelOrder = useOrderStore(s => s.cancelOrder)
  const etaSeconds = useOrderStore(s => s.etaSeconds)
  const driverLocation = useOrderStore(s => s.driverLocation)
  const routeInfo = useOrderStore(s => s.routeInfo)

  const [isCancelling, setIsCancelling] = useState(false)

  const { isConnected, reconnectAttempts } = useWebSocket({
    orderId,
    token,
    enabled: !!orderId && !!token,
  })

  useEffect(() => {
    if (webApp && webApp.BackButton) webApp.BackButton.hide()
  }, [webApp])

  useEffect(() => {
    if (order?.status === 'ride_completed') {
      navigate(`/completed/${orderId}`, { replace: true })
    }
  }, [order?.status, orderId, navigate])

  const handleCancel = () => {
    const message = t('ride.cancel_confirm') || 'Вы уверены, что хотите отменить заказ?'
    if (webApp?.showConfirm && tgSupportsPopups) {
      webApp.showConfirm(message, (confirmed) => { if (confirmed) executeCancel() })
    } else {
      if (window.confirm(message)) executeCancel()
    }
  }

  const executeCancel = async () => {
    try {
      setIsCancelling(true)
      await cancelOrder(orderId)
      navigate(locationSlug ? `/?slug=${locationSlug}` : '/', { replace: true })
    } catch (e) {
      console.error('Failed to cancel order:', e)
    } finally {
      setIsCancelling(false)
    }
  }

  const handleShare = async () => {
    try {
      const shareData = await ordersApi.shareOrder(orderId)
      const trackPath = currentPlatform === 'wechat'
        ? `/we/track/${shareData.share_token}`
        : `/track/${shareData.share_token}`
      const shareUrl = `${window.location.origin}${trackPath}`

      if (navigator.share) {
        await navigator.share({ title: t('app.name'), text: t('ride.share_trip'), url: shareUrl })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        const copied = t('messages.link_copied')
        if (webApp?.showAlert && tgSupportsPopups) {
          webApp.showAlert(copied)
        } else {
          alert(copied)
        }
      }
    } catch (e) {
      console.error('Failed to share:', e)
    }
  }

  if (!order || order.id !== orderId) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="w-10 h-10 animate-spin rounded-full border-[3px] border-aparu-brand border-t-transparent" />
      </div>
    )
  }

  const mapCenter: [number, number] = order.point_a
    ? [order.point_a.lat, order.point_a.lng]
    : [49.9337, 82.6098]

  const markers = []
  if (order.point_a) {
    markers.push({ id: 'point_a', position: [order.point_a.lat, order.point_a.lng] as [number, number], hint: order.point_a.address })
  }
  if (order.point_b) {
    markers.push({ id: 'point_b', position: [order.point_b.lat, order.point_b.lng] as [number, number], hint: order.point_b.address })
  }

  const canCancel = ['searching', 'driver_assigned', 'driver_arriving', 'no_drivers'].includes(order.status)
  const canShare = ['driver_assigned', 'driver_arriving', 'driver_arrived', 'ride_started'].includes(order.status)
  const polylineCoordinates = routeInfo ? routeInfo.coordinates.map(c => [c[0], c[1]] as [number, number]) : undefined

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden relative">
      {/* Reconnect banner */}
      {!isConnected && reconnectAttempts > 0 && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 px-4 py-3 text-sm text-center font-semibold">
          {t('errors.websocket_reconnecting', { attempt: reconnectAttempts, max: 10 })}
        </div>
      )}

      <div className="flex-1 relative z-0">
        <Map
          center={mapCenter}
          zoom={15}
          markers={markers}
          polyline={polylineCoordinates}
          driverPosition={driverLocation || undefined}
          driverInfo={order.driver}
        />
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-safe pt-8 space-y-3 bg-gradient-to-t from-white/95 via-white/80 to-transparent">
        <StatusBar status={order.status} etaSeconds={etaSeconds} updatedAt={order.updated_at} />

        {order.driver && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <DriverCard driver={order.driver} />
          </div>
        )}

        {order.status === 'no_drivers' && (
          <button
            onClick={() => cancelOrder(orderId).then(() => navigate(locationSlug ? `/?slug=${locationSlug}` : '/', { replace: true }))}
            className="w-full bg-aparu-brand text-white font-bold py-4 rounded-md transition-opacity active:opacity-80"
          >
            {t('buttons.retry')}
          </button>
        )}

        <div className="flex gap-3">
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex-1 bg-white border border-red-200 text-red-600 font-bold py-3.5 rounded-md text-center disabled:opacity-50 active:bg-red-50 transition-colors"
            >
              {t('buttons.cancel')}
            </button>
          )}
          {canShare && (
            <button
              onClick={handleShare}
              className="flex-1 bg-aparu-textMain text-white font-bold py-3.5 rounded-md text-center active:opacity-80 transition-opacity"
            >
              {t('buttons.share')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
