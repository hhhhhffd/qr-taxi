import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocationStore } from '../stores/locationStore'
import { useOrderStore } from '../stores/orderStore'
import { useAuthStore } from '../stores/authStore'
import { geoApi } from '../api/geo'
import { useTelegram } from '../hooks/useTelegram'

import Map from '../components/Map'
import DestinationInput from '../components/DestinationInput'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { TARIFFS, calculatePrice, formatPrice } from '../utils/price'
import type { RouteResponse, PointBInput, Tariff } from '../types'

// ─── Inline SVG icons ──────────────────────────────────────────────────────────

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12M12 6l4 4-4 4"/>
    </svg>
  )
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8"/>
      <path d="M10 9v5M10 7h.01"/>
    </svg>
  )
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 5v10M5 10h10"/>
    </svg>
  )
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l8 8M14 6l-8 8"/>
    </svg>
  )
}

function IconTrending({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,14 7,10 11,12 17,6"/>
      <polyline points="13,6 17,6 17,10"/>
    </svg>
  )
}

// ─── Car icons ─────────────────────────────────────────────────────────────────

function CarSedanIcon({ active }: { active: boolean }) {
  const c = active ? '#FF6A00' : '#999999'
  return (
    <svg width="44" height="22" viewBox="0 0 44 22" fill="none">
      <path d="M3 16h38M3 16v-3l4-6h24l4 6v3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 7l2-3h14l2 3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="11" cy="18.5" r="2.5" stroke={c} strokeWidth="1.5"/>
      <circle cx="33" cy="18.5" r="2.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  )
}

function CarUniversalIcon({ active }: { active: boolean }) {
  const c = active ? '#FF6A00' : '#999999'
  return (
    <svg width="44" height="22" viewBox="0 0 44 22" fill="none">
      <path d="M3 16h38M3 16V7h32l6 9" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 7V4h28v3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="11" cy="18.5" r="2.5" stroke={c} strokeWidth="1.5"/>
      <circle cx="33" cy="18.5" r="2.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  )
}

function CarMinivanIcon({ active }: { active: boolean }) {
  const c = active ? '#FF6A00' : '#999999'
  return (
    <svg width="44" height="22" viewBox="0 0 44 22" fill="none">
      <path d="M3 16h38M3 16V8h36l2 8" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 8V5h30v3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="11" cy="18.5" r="2.5" stroke={c} strokeWidth="1.5"/>
      <circle cx="33" cy="18.5" r="2.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  )
}

function TariffCarIcon({ tariff, active }: { tariff: Tariff; active: boolean }) {
  if (tariff.car_type === 'minivan') return <CarMinivanIcon active={active} />
  if (tariff.car_type === 'universal') return <CarUniversalIcon active={active} />
  return <CarSedanIcon active={active} />
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OrderPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { webApp } = useTelegram()
  const location = useLocationStore((s) => s.location)
  const locationError = useLocationStore((s) => s.error)
  const user = useAuthStore((s) => s.user)
  const requestPhone = useAuthStore((s) => s.requestPhone)

  const createOrder = useOrderStore((s) => s.createOrder)
  const setPointB = useOrderStore((s) => s.setPointB)
  const setTariff = useOrderStore((s) => s.setTariff)
  const setPayment = useOrderStore((s) => s.setPayment)
  const selectedTariff = useOrderStore((s) => s.selectedTariff)
  const selectedPayment = useOrderStore((s) => s.selectedPayment)
  const pointB = useOrderStore((s) => s.pointB)

  const [routeInfo, setRouteLocalInfo] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [extraStops, setExtraStops] = useState<string[]>([])
  const [showTariffInfo, setShowTariffInfo] = useState(false)

  const currentLang = i18n.resolvedLanguage || 'ru'

  const getTariffName = (tariff: Tariff) => {
    if (currentLang === 'kz') return tariff.name_kz
    if (currentLang === 'en') return tariff.name_en
    return tariff.name_ru
  }

  useEffect(() => {
    if (!selectedTariff) setTariff(TARIFFS[0])
  }, [selectedTariff, setTariff])

  const handlePointBSelect = async (point: PointBInput) => {
    setPointB(point)
    if (location) {
      try {
        const res = await geoApi.getRoute({
          points: [
            { lat: location.lat, lng: location.lng },
            { lat: point.lat, lng: point.lng },
          ],
        })
        setRouteLocalInfo(res)
      } catch (err) {
        console.error('Failed to get route', err)
      }
    }
  }

  const handlePointBClear = () => {
    setPointB(null)
    setRouteLocalInfo(null)
  }

  const addExtraStop = () => setExtraStops((p) => [...p, ''])
  const removeExtraStop = (idx: number) => setExtraStops((p) => p.filter((_, i) => i !== idx))
  const updateExtraStop = (idx: number, val: string) =>
    setExtraStops((p) => p.map((s, i) => (i === idx ? val : s)))

  const submitOrder = async () => {
    if (!location || !pointB) {
      setError(t('order.specify_destination'))
      return
    }
    try {
      setLoading(true)
      const order = await createOrder(location.slug)
      navigate(`/ride/${order.id}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error creating order')
    } finally {
      setLoading(false)
    }
  }

  const handleOrder = async () => {
    if (!location) return
    setError(null)
    if (!pointB) {
      setError(t('order.specify_destination'))
      return
    }

    if (user?.phone) {
      await submitOrder()
      return
    }

    if (webApp && webApp.requestContact) {
      try {
        const onContact = async (event: unknown) => {
          const e = event as { status: string; contact?: { phone_number: string } }
          webApp.offEvent!('contactRequested', onContact)
          if (e.status === 'sent' && e.contact?.phone_number) {
            try {
              await requestPhone(e.contact.phone_number)
            } catch {
              setError(t('errors.phone_required'))
              return
            }
            await submitOrder()
          }
        }
        webApp.onEvent!('contactRequested', onContact)
        webApp.requestContact()
        return
      } catch (err) {
        console.warn('requestContact failed', err)
      }
    }

    const phone = prompt(t('order.phone_prompt'))
    if (!phone) return
    try {
      await requestPhone(phone)
    } catch {
      setError(t('errors.phone_required'))
      return
    }
    await submitOrder()
  }

  // ─── Error / loading states ─────────────────────────────────────────────────

  if (!location) {
    if (locationError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center p-6 text-center">
          <div className="text-4xl mb-4">📍</div>
          <h2 className="text-xl font-bold mb-2 text-aparu-textMain">
            {t('order.location_error', 'Ошибка загрузки')}
          </h2>
          <p className="text-aparu-textMuted">{locationError}</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="mt-6 px-6 py-2 bg-aparu-brand text-white rounded-md font-medium"
          >
            На главную
          </button>
        </div>
      )
    }
    return (
      <div className="flex h-screen items-center justify-center text-aparu-textMuted">
        Loading location...
      </div>
    )
  }

  // ─── Derived state ──────────────────────────────────────────────────────────

  const markers = [
    { id: 'pointA', position: [location.lat, location.lng] as [number, number], hint: location.hint },
  ]
  if (pointB) {
    markers.push({
      id: 'pointB',
      position: [pointB.lat, pointB.lng] as [number, number],
      hint: t('order.point_b', 'Куда'),
    })
  }

  const isMaxDistance = !!(routeInfo && routeInfo.distance / 1000 > 30)
  const sedanTariffs = TARIFFS.filter((t) => t.car_type === 'sedan')
  const nonSedanTariffs = TARIFFS.filter((t) => t.car_type !== 'sedan')
  const isSedanSelected = selectedTariff?.car_type === 'sedan'
  const sedanFallbackTariff = sedanTariffs[0] ?? null
  const sedanDisplayTariff = (isSedanSelected ? selectedTariff : sedanFallbackTariff) ?? null
  const primaryTariffs = [
    ...(sedanDisplayTariff ? [{ kind: 'sedan' as const, tariff: sedanDisplayTariff }] : []),
    ...nonSedanTariffs.map((tariff) => ({ kind: 'single' as const, tariff })),
  ]
  const isOrderDisabled = loading || isMaxDistance || !selectedTariff || !pointB

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-white">

      {/* ── Map ── */}
      <div className="flex-1 min-h-0 relative">
        {/* Language switcher */}
        <div className="absolute top-4 left-4 z-50">
          <LanguageSwitcher />
        </div>

        <Map
          center={[location.lat, location.lng]}
          zoom={15}
          markers={markers}
          polyline={routeInfo?.coordinates as [number, number][]}
          bbox={routeInfo?.bbox}
        />
      </div>

      {/* ── Bottom panel ── */}
      <div className="bg-white z-10 flex flex-col overflow-y-auto hide-scrollbar" style={{ maxHeight: '68vh' }}>

        {/* Address block */}
        <div className="flex flex-col px-4 pt-3 bg-white">

          {/* Extra stops */}
          {extraStops.map((stop, idx) => (
            <div key={idx} className="flex items-center gap-3 py-3 border-b border-aparu-border">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-aparu-brand" />
              </div>
              <input
                type="text"
                value={stop}
                onChange={(e) => updateExtraStop(idx, e.target.value)}
                placeholder={t('order.stop_placeholder', { number: idx + 1 })}
                className="flex-1 text-base text-aparu-textMain placeholder:text-aparu-textMuted focus:outline-none"
              />
              <button
                onClick={() => removeExtraStop(idx)}
                className="w-6 h-6 flex items-center justify-center shrink-0"
              >
                <IconX className="w-4 h-4 text-aparu-textMuted" />
              </button>
            </div>
          ))}

          {/* Point B */}
          <div className="flex items-center gap-3 py-3 border-b border-aparu-border">
            <IconArrowRight className="w-5 h-5 text-aparu-brand shrink-0" />
            <DestinationInput
              inline
              onSelect={handlePointBSelect}
              onClear={handlePointBClear}
              currentLocation={{ lat: location.lat, lng: location.lng }}
              placeholder={t('order.point_b_placeholder', 'Куда')}
            />
            <button
              onClick={addExtraStop}
              className="w-8 h-8 rounded-full border border-aparu-textMuted flex items-center justify-center shrink-0"
            >
              <IconPlus className="w-4 h-4 text-aparu-textMuted" />
            </button>
          </div>

          {/* Note */}
          <div className="flex items-center gap-3 py-3 border-b border-aparu-border">
            <IconInfo className="w-5 h-5 text-aparu-brand shrink-0" />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('order.note_placeholder')}
              className="flex-1 text-base text-aparu-textMain placeholder:text-aparu-textMuted focus:outline-none"
            />
          </div>
        </div>

        {/* Tariff carousel */}
        <div className="flex gap-3 overflow-x-auto snap-x px-4 py-3 hide-scrollbar">
          {primaryTariffs.map((card) => {
            const isSelected = card.kind === 'sedan'
              ? isSedanSelected
              : selectedTariff?.key === card.tariff.key
            const priceTariff = card.kind === 'sedan' ? sedanDisplayTariff : card.tariff
            const p = priceTariff && routeInfo ? calculatePrice(priceTariff, routeInfo) : null
            const title = card.kind === 'sedan'
              ? t('order.sedan_group', 'Легковушка')
              : getTariffName(card.tariff)
            return (
              <button
                key={card.kind === 'sedan' ? 'sedan-group' : card.tariff.key}
                onClick={() => {
                  if (card.kind === 'sedan') {
                    if (sedanDisplayTariff) setTariff(sedanDisplayTariff)
                    return
                  }
                  setTariff(card.tariff)
                }}
                className={`snap-start shrink-0 flex flex-col items-center justify-center px-3 pt-2 pb-2.5 rounded-xl transition-all w-28 ${
                  isSelected ? 'bg-white shadow-card' : 'bg-aparu-bgGray'
                }`}
              >
                {card.kind === 'sedan'
                  ? <CarSedanIcon active={isSelected} />
                  : <TariffCarIcon tariff={card.tariff} active={isSelected} />}
                <div
                  className={`text-xs font-medium mt-1.5 text-center leading-tight ${
                    isSelected ? 'text-aparu-textMain' : 'text-aparu-textMuted'
                  }`}
                >
                  {title}
                </div>
                {p !== null && (
                  <div
                    className={`text-xs mt-0.5 ${
                      isSelected ? 'text-aparu-brand font-medium' : 'text-aparu-textMuted'
                    }`}
                  >
                    {formatPrice(p)}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Tariff label + Payment method */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-aparu-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
              <IconTrending className="w-3.5 h-3.5 text-aparu-brand" />
            </div>
            <span className="text-sm font-medium text-aparu-textMain">{t('order.tariff')}</span>
            <button
              onClick={() => setShowTariffInfo(true)}
              className="w-5 h-5 bg-aparu-bgGray text-aparu-textMuted rounded-full flex items-center justify-center text-xs leading-none"
            >
              ?
            </button>
          </div>
          <button
            onClick={() => setPayment(selectedPayment === 'cash' ? 'kaspi_qr' : 'cash')}
            className="border border-aparu-brand text-aparu-brand px-5 py-1.5 rounded-md font-medium text-sm"
          >
            {selectedPayment === 'cash' ? t('order.cash', 'Наличные') : 'Kaspi QR'}
          </button>
        </div>

        {/* Class selector (sedan tariffs) */}
        {isSedanSelected && (
          <div className="flex gap-2 px-4 py-3">
            {sedanTariffs.map((tariff) => {
              const isSelected = selectedTariff?.key === tariff.key
              return (
                <button
                  key={tariff.key}
                  onClick={() => setTariff(tariff)}
                  className={`flex-1 py-3 rounded text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-white shadow-md text-aparu-textMain'
                      : 'bg-aparu-bgGray text-aparu-textMuted'
                  }`}
                >
                  {getTariffName(tariff)}
                </button>
              )
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mb-1 text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded-md">
            {error}
          </div>
        )}

        {/* Order button */}
        <div className="px-4 pt-1 pb-safe">
          {isMaxDistance && (
            <p className="text-sm text-center mb-2 font-medium text-aparu-brand">
              {t('order.max_distance_warning', 'Слишком большое расстояние. Максимум 30 км.')}
            </p>
          )}
          <button
            onClick={handleOrder}
            disabled={isOrderDisabled}
            className={`w-full font-semibold rounded-md py-4 text-lg transition-colors ${
              isOrderDisabled
                ? 'bg-aparu-bgGray text-aparu-textMuted'
                : 'bg-aparu-brand text-white'
            }`}
          >
            {loading ? t('common.loading', 'Загрузка...') : t('order.order_button', 'Заказать')}
          </button>
        </div>
      </div>
      {/* Tariff info panel */}
      {showTariffInfo && selectedTariff && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setShowTariffInfo(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl shadow-xl px-5 pt-5 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowTariffInfo(false)}
                className="w-7 h-7 rounded-full bg-aparu-bgGray flex items-center justify-center"
              >
                <IconX className="w-3.5 h-3.5 text-aparu-textMuted" />
              </button>
            </div>

            {/* Price */}
            <div className="text-3xl font-bold text-aparu-textMain mb-5">
              {(() => {
                const p = routeInfo ? calculatePrice(selectedTariff, routeInfo) : null
                if (p !== null) return `${p} ₸`
                return `${t('tariff_info.from')} ${selectedTariff.base_fare} ₸`
              })()}
            </div>

            {/* Breakdown */}
            <div className="flex flex-col gap-2 pb-5">
              <div className="flex justify-between text-sm">
                <span className="text-aparu-textMuted">{t('tariff_info.base_fare')}</span>
                <span className="font-medium text-aparu-textMain">{selectedTariff.base_fare} ₸</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-aparu-textMuted">{t('tariff_info.per_km')}</span>
                <span className="font-medium text-aparu-textMain">{selectedTariff.per_km} ₸</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-aparu-textMuted">{t('tariff_info.per_min')}</span>
                <span className="font-medium text-aparu-textMain">20 ₸</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
