/**
 * LocationsPage — CRUD table for QR scan locations.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { adminApi } from '../../api/admin'
import type { AdminLocation, AdminLocationCreateRequest } from '../../api/admin'
import { reverseGeocode } from '../../api/geo'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const UKM_CENTER: [number, number] = [49.9478, 82.6284]

const EMPTY_FORM: AdminLocationCreateRequest = {
  slug: '',
  name: '',
  lat: UKM_CENTER[0],
  lng: UKM_CENTER[1],
  hint_ru: '',
  hint_kz: '',
  hint_en: '',
  address: '',
  is_active: true,
}

function PickerMap({
  lat,
  lng,
  onPick,
}: {
  lat: number
  lng: number
  onPick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })

  return (
    <Marker
      position={[lat, lng]}
      draggable
      eventHandlers={{
        dragend(e) {
          const pos = (e.target as L.Marker).getLatLng()
          onPick(pos.lat, pos.lng)
        },
      }}
    />
  )
}

export default function LocationsPage() {
  const { t } = useTranslation()
  const [locations, setLocations] = useState<AdminLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<AdminLocationCreateRequest>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  const fetchLocations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.getLocations()
      setLocations(data)
    } catch {
      setError(t('admin.errors.locations_load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void fetchLocations()
  }, [fetchLocations])

  const openCreate = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (loc: AdminLocation) => {
    setEditId(loc.id)
    setForm({
      slug: loc.slug,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      hint_ru: loc.hint_ru,
      hint_kz: loc.hint_kz ?? '',
      hint_en: loc.hint_en ?? '',
      address: loc.address ?? '',
      is_active: loc.is_active,
    })
    setModalOpen(true)
  }

  const handleMapPick = async (lat: number, lng: number) => {
    setForm((f) => ({ ...f, lat, lng, address: '' }))
    setGeocoding(true)
    try {
      const rev = await reverseGeocode({ latitude: lat, longitude: lng })
      setForm((f) => ({ ...f, address: rev.address }))
    } catch {
      // Keep address empty when reverse geocode fails.
    } finally {
      setGeocoding(false)
    }
  }

  const handleField = (key: keyof AdminLocationCreateRequest, value: string | boolean | number) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.slug || !form.name || !form.hint_ru) {
      alert(t('admin.locations.required_fields'))
      return
    }
    setSaving(true)
    try {
      if (editId !== null) {
        const updated = await adminApi.updateLocation(editId, form)
        setLocations((prev) => prev.map((l) => (l.id === editId ? updated : l)))
      } else {
        const created = await adminApi.createLocation(form)
        setLocations((prev) => [created, ...prev])
      }
      setModalOpen(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? t('admin.errors.location_save'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (loc: AdminLocation) => {
    try {
      const updated = await adminApi.toggleLocation(loc.id)
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? updated : l)))
    } catch {
      alert(t('admin.errors.location_toggle'))
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-white/10" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121a28]">
          <div className="divide-y divide-white/5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-4">
                <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                <div className="h-4 flex-1 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-10 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.locations.page_title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('admin.locations.page_subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-aparu-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95"
        >
          {t('admin.locations.add_location')}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121a28]">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">{t('admin.locations.table.slug')}</th>
              <th className="px-4 py-3 text-left">{t('admin.locations.table.name')}</th>
              <th className="px-4 py-3 text-left">{t('admin.locations.table.coords')}</th>
              <th className="px-4 py-3 text-center">{t('admin.locations.table.orders')}</th>
              <th className="px-4 py-3 text-center">{t('admin.locations.table.active')}</th>
              <th className="px-4 py-3 text-right">{t('admin.locations.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {locations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  <p className="text-sm">{t('admin.locations.empty_title')}</p>
                  <p className="mt-1 text-xs">{t('admin.locations.empty_subtitle')}</p>
                </td>
              </tr>
            )}
            {locations.map((loc) => (
              <tr key={loc.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-slate-300">{loc.slug}</td>
                <td className="px-4 py-3 font-medium text-white">{loc.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-center text-slate-200">{loc.order_count}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggle(loc)}
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                      loc.is_active
                        ? 'bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/30'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20',
                    ].join(' ')}
                  >
                    {loc.is_active ? t('admin.states.active') : t('admin.states.inactive')}
                  </button>
                </td>
                <td className="space-x-3 px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(loc)}
                    className="text-xs font-medium text-blue-300 hover:text-blue-200"
                  >
                    {t('admin.actions.edit')}
                  </button>
                  <button
                    onClick={() => {
                      adminApi.downloadQr(loc.id, loc.slug).catch(() => {
                        alert(t('admin.errors.qr_download'))
                      })
                    }}
                    className="text-xs font-medium text-purple-300 hover:text-purple-200"
                  >
                    {t('admin.actions.download_qr')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#121a28] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">
                {editId !== null ? t('admin.locations.edit_location') : t('admin.locations.new_location')}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-xl leading-none text-slate-400 transition-colors hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div>
                <p className="mb-1 text-xs text-slate-400">{t('admin.locations.map_hint')}</p>
                <div className="h-48 overflow-hidden rounded-lg border border-white/10">
                  <MapContainer
                    center={[form.lat, form.lng]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <PickerMap lat={form.lat} lng={form.lng} onPick={handleMapPick} />
                  </MapContainer>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400">{t('admin.locations.latitude')}</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={form.lat}
                      onChange={(e) => handleField('lat', parseFloat(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none focus:border-aparu-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400">{t('admin.locations.longitude')}</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={form.lng}
                      onChange={(e) => handleField('lng', parseFloat(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none focus:border-aparu-brand"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('admin.locations.slug_required')}</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => handleField('slug', e.target.value)}
                  placeholder="mega_exit1"
                  className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-aparu-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('admin.locations.name_required')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleField('name', e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-aparu-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t('labels.address')}
                  {geocoding && <span className="ml-1 text-blue-300">({t('admin.locations.geocoding')})</span>}
                </label>
                <input
                  type="text"
                  value={form.address ?? ''}
                  onChange={(e) => handleField('address', e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-aparu-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('admin.locations.hint_ru_required')}</label>
                <input
                  type="text"
                  value={form.hint_ru}
                  onChange={(e) => handleField('hint_ru', e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-aparu-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t('admin.locations.hint_kz')}</label>
                  <input
                    type="text"
                    value={form.hint_kz ?? ''}
                    onChange={(e) => handleField('hint_kz', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-aparu-brand"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t('admin.locations.hint_en')}</label>
                  <input
                    type="text"
                    value={form.hint_en ?? ''}
                    onChange={(e) => handleField('hint_en', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-aparu-brand"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => handleField('is_active', e.target.checked)}
                  className="h-4 w-4 accent-aparu-brand"
                />
                {t('admin.locations.active')}
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-300 transition-colors hover:text-white"
              >
                {t('buttons.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-aparu-brand px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {saving ? t('admin.actions.saving') : t('buttons.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
