/**
 * OrdersPage — filterable admin order list with detail modal.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { adminApi } from '../../api/admin'
import type { AdminOrder, AdminOrderDetail, AdminOrderFilter } from '../../api/admin'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STATUS_OPTIONS = [
  'searching',
  'driver_assigned',
  'driver_arriving',
  'driver_arrived',
  'ride_started',
  'ride_completed',
  'no_drivers',
  'cancelled',
]

const TARIFF_OPTIONS = ['econom', 'optimal', 'comfort', 'universal', 'minivan']

const STATUS_COLORS: Record<string, string> = {
  searching: 'bg-yellow-400/20 text-yellow-200',
  driver_assigned: 'bg-blue-400/20 text-blue-200',
  driver_arriving: 'bg-indigo-400/20 text-indigo-200',
  driver_arrived: 'bg-purple-400/20 text-purple-200',
  ride_started: 'bg-cyan-400/20 text-cyan-200',
  ride_completed: 'bg-emerald-400/20 text-emerald-200',
  no_drivers: 'bg-orange-400/20 text-orange-200',
  cancelled: 'bg-red-400/20 text-red-200',
}

interface FilterState {
  status: string
  tariff: string
  dateFrom: string
  dateTo: string
}

function resolveLocale(language: string): string {
  if (language.startsWith('kz')) return 'kk-KZ'
  if (language.startsWith('en')) return 'en-US'
  if (language.startsWith('zh')) return 'zh-CN'
  return 'ru-RU'
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function OrdersPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFiltersRef = useRef<FilterState>({
    status: searchParams.get('status') ?? '',
    tariff: searchParams.get('tariff') ?? '',
    dateFrom: searchParams.get('from') ?? '',
    dateTo: searchParams.get('to') ?? '',
  })

  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState(initialFiltersRef.current.status)
  const [tariffFilter, setTariffFilter] = useState(initialFiltersRef.current.tariff)
  const [dateFrom, setDateFrom] = useState(initialFiltersRef.current.dateFrom)
  const [dateTo, setDateTo] = useState(initialFiltersRef.current.dateTo)

  const [detail, setDetail] = useState<AdminOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language)

  const fetchOrders = useCallback(
    async (filters: FilterState) => {
      setLoading(true)
      setError(null)
      const filter: AdminOrderFilter = { limit: 100 }
      if (filters.status) filter.status = filters.status
      if (filters.tariff) filter.tariff = filters.tariff
      if (filters.dateFrom) filter.date_from = filters.dateFrom
      if (filters.dateTo) filter.date_to = filters.dateTo

      try {
        const data = await adminApi.getOrders(filter)
        setOrders(data)
      } catch {
        setError(t('admin.errors.orders_load'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void fetchOrders(initialFiltersRef.current)
  }, [fetchOrders])

  const pushFiltersToQuery = (filters: FilterState) => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.tariff) params.set('tariff', filters.tariff)
    if (filters.dateFrom) params.set('from', filters.dateFrom)
    if (filters.dateTo) params.set('to', filters.dateTo)
    setSearchParams(params, { replace: true })
  }

  const applyFilters = () => {
    const filters: FilterState = {
      status: statusFilter,
      tariff: tariffFilter,
      dateFrom,
      dateTo,
    }
    pushFiltersToQuery(filters)
    void fetchOrders(filters)
  }

  const clearFilters = () => {
    const cleared: FilterState = {
      status: '',
      tariff: '',
      dateFrom: '',
      dateTo: '',
    }
    setStatusFilter('')
    setTariffFilter('')
    setDateFrom('')
    setDateTo('')
    pushFiltersToQuery(cleared)
    void fetchOrders(cleared)
  }

  const openDetail = async (order: AdminOrder) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await adminApi.getOrder(order.id)
      setDetail(data)
    } catch {
      alert(t('admin.errors.order_detail_load'))
    } finally {
      setDetailLoading(false)
    }
  }

  const selectStyle =
    'rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-aparu-brand'
  const inputStyle =
    'rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-aparu-brand'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('admin.orders.page_title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('admin.orders.page_subtitle')}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#121a28] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">{t('admin.orders.filters_title')}</h2>
          <span className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-slate-300">
            {t('admin.orders.filters_shareable')}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t('admin.orders.status')}</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectStyle}>
              <option value="">{t('admin.orders.all')}</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t('admin.orders.tariff')}</label>
            <select value={tariffFilter} onChange={(e) => setTariffFilter(e.target.value)} className={selectStyle}>
              <option value="">{t('admin.orders.all')}</option>
              {TARIFF_OPTIONS.map((tariff) => (
                <option key={tariff} value={tariff}>
                  {t(`tariffs.${tariff}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t('admin.orders.from')}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputStyle} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t('admin.orders.to')}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputStyle} />
          </div>

          <button
            onClick={applyFilters}
            className="rounded-lg bg-aparu-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95"
          >
            {t('admin.actions.apply')}
          </button>
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white"
          >
            {t('admin.actions.clear')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121a28]">
          <div className="divide-y divide-white/5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <div className="h-4 w-10 animate-pulse rounded bg-white/10" />
                <div className="h-5 w-24 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
                <div className="h-4 flex-1 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121a28]">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">{t('admin.orders.status')}</th>
                <th className="px-4 py-3 text-left">{t('admin.orders.tariff')}</th>
                <th className="px-4 py-3 text-left">{t('admin.orders.location')}</th>
                <th className="px-4 py-3 text-right">{t('labels.price')}</th>
                <th className="px-4 py-3 text-left">{t('labels.created_at')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {t('admin.orders.empty')}
                  </td>
                </tr>
              )}
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="cursor-pointer hover:bg-white/5"
                  onClick={() => openDetail(order)}
                >
                  <td className="px-4 py-3 font-mono text-slate-300">#{order.id}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-white/10 text-slate-300'}`}>
                      {t(`status.${order.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{t(`tariffs.${order.tariff}`)}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-300">{order.location_name}</td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {order.final_price ?? order.estimated_price ?? '—'} ₸
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(order.created_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-white/10 px-4 py-2 text-xs text-slate-500">
            {t('admin.orders.count', { count: orders.length })}
          </div>
        </div>
      )}

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#121a28] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">
                {detail ? `${t('admin.orders.detail.title')} #${detail.id}` : t('app.loading')}
              </h2>
              <button
                onClick={() => setDetail(null)}
                className="text-xl leading-none text-slate-400 transition-colors hover:text-white"
              >
                ×
              </button>
            </div>

            {detailLoading && (
              <div className="flex flex-1 items-center justify-center py-12 text-slate-400">
                {t('app.loading')}
              </div>
            )}

            {detail && (
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
                <div className="h-48 overflow-hidden rounded-lg border border-white/10">
                  <MapContainer
                    center={[detail.point_a_lat, detail.point_a_lng]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[detail.point_a_lat, detail.point_a_lng]} />
                    {detail.point_b_lat !== null && detail.point_b_lng !== null && (
                      <>
                        <Marker position={[detail.point_b_lat, detail.point_b_lng]} />
                        <Polyline
                          positions={[
                            [detail.point_a_lat, detail.point_a_lng],
                            [detail.point_b_lat, detail.point_b_lng],
                          ]}
                          color="#FF6A00"
                          dashArray="6 4"
                        />
                      </>
                    )}
                  </MapContainer>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.status')}</span>
                    <p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[detail.status] ?? 'bg-white/10 text-slate-300'}`}>
                        {t(`status.${detail.status}`)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.tariff')}</span>
                    <p className="font-medium text-white">{t(`tariffs.${detail.tariff}`)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.location')}</span>
                    <p className="font-medium text-white">{detail.location_name}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.price')}</span>
                    <p className="font-medium text-white">
                      {detail.final_price ?? detail.estimated_price ?? '—'} ₸
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.point_a')}</span>
                    <p className="text-xs text-slate-200">{detail.point_a_address}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.point_b')}</span>
                    <p className="text-xs text-slate-200">{detail.point_b_address ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.created')}</span>
                    <p className="text-xs text-slate-200">{fmtDate(detail.created_at, locale)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('admin.orders.detail.completed')}</span>
                    <p className="text-xs text-slate-200">{fmtDate(detail.completed_at, locale)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-white">{t('admin.orders.detail.timeline')}</h3>
                  <ol className="relative ml-3 space-y-3 border-l border-white/15">
                    {detail.events.map((event) => (
                      <li key={event.id} className="ml-4">
                        <div className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-[#121a28] bg-aparu-brand" />
                        <span className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[event.status] ?? 'bg-white/10 text-slate-300'}`}>
                          {t(`status.${event.status}`)}
                        </span>
                        <p className="text-xs text-slate-500">{fmtDate(event.created_at, locale)}</p>
                      </li>
                    ))}
                    {detail.events.length === 0 && (
                      <li className="ml-4 text-xs text-slate-400">{t('admin.orders.detail.no_events')}</li>
                    )}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
