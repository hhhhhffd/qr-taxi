/**
 * HeatmapPage — admin analytics with Metabase charts and pickup heatmap.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { adminApi } from '../../api/admin'
import type { HeatmapPoint, AnalyticsSummary, MetabaseEmbedConfig } from '../../api/admin'

const UKM_CENTER: [number, number] = [49.9478, 82.6284]

function ensureHeatPlugin(timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (ready: boolean) => {
      if (settled) return
      settled = true
      resolve(ready)
    }

    const isReady = (): boolean => {
      const extL = L as unknown as { heatLayer?: unknown }
      return typeof extL.heatLayer === 'function'
    }

    const extL = L as unknown as { heatLayer?: unknown }
    if (typeof extL.heatLayer === 'function') {
      done(true)
      return
    }

    ;(window as Window & { L?: typeof L }).L = L

    const existing = document.getElementById('leaflet-heat-script') as HTMLScriptElement | null
    if (existing) {
      if (isReady()) {
        done(true)
        return
      }
      existing.addEventListener('load', () => done(isReady()), { once: true })
      existing.addEventListener('error', () => done(false), { once: true })
      window.setTimeout(() => done(isReady()), timeoutMs)
      return
    }

    const script = document.createElement('script')
    script.id = 'leaflet-heat-script'
    script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
    script.async = true
    script.onload = () => done(isReady())
    script.onerror = () => done(false)
    document.head.appendChild(script)
    window.setTimeout(() => done(isReady()), timeoutMs)
  })
}

function HeatLayer({ points, ready }: { points: HeatmapPoint[]; ready: boolean }) {
  const map = useMap()
  const layerRef = useRef<{ remove: () => void } | null>(null)

  useEffect(() => {
    if (!ready || points.length === 0) return

    const extL = L as unknown as {
      heatLayer: (
        latlngs: [number, number, number][],
        options?: Record<string, unknown>,
      ) => { addTo: (m: unknown) => { remove: () => void } }
    }

    if (typeof extL.heatLayer !== 'function') return

    const maxWeight = Math.max(...points.map((p) => p.weight), 1)
    const latlngs: [number, number, number][] = points.map((p) => [
      p.lat,
      p.lng,
      p.weight / maxWeight,
    ])

    const layer = extL
      .heatLayer(latlngs, {
        radius: 36,
        blur: 24,
        maxZoom: 17,
        max: 1,
        gradient: { 0.4: '#60A5FA', 0.7: '#F59E0B', 1.0: '#EF4444' },
      })
      .addTo(map)

    layerRef.current = layer as unknown as { remove: () => void }
    return () => {
      layerRef.current?.remove()
      layerRef.current = null
    }
  }, [map, points, ready])

  return null
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#121a28] p-5">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function fmtWait(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function HeatmapPage() {
  const { t } = useTranslation()
  const [points, setPoints] = useState<HeatmapPoint[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [metabase, setMetabase] = useState<MetabaseEmbedConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [heatReady, setHeatReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metabaseFrameError, setMetabaseFrameError] = useState(false)

  useEffect(() => {
    Promise.all([
      adminApi.getHeatmap(),
      adminApi.getSummary(),
      ensureHeatPlugin(),
      adminApi.getMetabaseEmbed().catch(() => null),
    ])
      .then(([pts, sum, heatPluginReady, metabaseData]) => {
        setPoints(pts)
        setSummary(sum)
        setMetabase(metabaseData)
        setHeatReady(heatPluginReady)
      })
      .catch(() => setError(t('admin.errors.analytics_load')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    setMetabaseFrameError(false)
  }, [metabase?.dashboard_url])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-white/10" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-[#121a28] p-5">
              <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
        <div className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-[#121a28]" />
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

  const maxWeight = Math.max(...points.map((p) => p.weight), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('admin.analytics.page_title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('admin.analytics.page_subtitle')}</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={t('admin.analytics.orders_today')} value={String(summary.total_today)} />
          <StatCard label={t('admin.analytics.orders_week')} value={String(summary.total_week)} />
          <StatCard
            label={t('admin.analytics.avg_price')}
            value={summary.avg_price !== null ? `${Math.round(summary.avg_price)} ₸` : '—'}
          />
          <StatCard
            label={t('admin.analytics.avg_wait')}
            value={fmtWait(summary.avg_wait_seconds)}
            sub={t('admin.analytics.avg_wait_sub')}
          />
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-[#121a28] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{t('admin.analytics.metabase_title')}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-slate-300">
              {t('admin.analytics.secure_embed')}
            </span>
            {metabase?.is_configured && metabase.dashboard_url && (
              <a
                href={metabase.dashboard_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-slate-200 transition-colors hover:border-white/40 hover:text-white"
              >
                {t('admin.analytics.open_dashboard')}
              </a>
            )}
          </div>
        </div>

        {metabase?.is_configured && metabase.dashboard_url ? (
          <>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <iframe
                src={metabase.dashboard_url}
                title={t('admin.analytics.metabase_title')}
                className="h-[620px] w-full bg-[#0b1018]"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                onError={() => setMetabaseFrameError(true)}
              />
            </div>
            {metabaseFrameError && (
              <p className="mt-2 text-xs text-amber-200">{t('admin.analytics.metabase_embed_failed')}</p>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="text-sm font-medium text-amber-200">{t('admin.analytics.metabase_not_configured')}</p>
            {metabase?.reason && (
              <p className="mt-1 text-xs text-amber-100/90">{metabase.reason}</p>
            )}
            <p className="mt-1 text-xs text-amber-100/90">{t('admin.analytics.metabase_setup_hint')}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#121a28] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{t('admin.analytics.heatmap_title')}</h2>
          {!heatReady && points.length > 0 && (
            <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-200">
              {t('admin.analytics.heatmap_fallback')}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10" style={{ height: '520px' }}>
          <MapContainer
            center={UKM_CENTER}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            {heatReady ? (
              <HeatLayer points={points} ready />
            ) : (
              points.map((pt, index) => {
                const intensity = pt.weight / maxWeight
                return (
                  <CircleMarker
                    key={`${pt.lat}-${pt.lng}-${index}`}
                    center={[pt.lat, pt.lng]}
                    radius={9 + intensity * 20}
                    pathOptions={{
                      color: '#F59E0B',
                      fillColor: '#F59E0B',
                      fillOpacity: 0.2 + intensity * 0.55,
                      weight: 1,
                    }}
                  />
                )
              })
            )}
          </MapContainer>
        </div>
        {points.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">{t('admin.analytics.no_heatmap_data')}</p>
        )}
      </section>

      {points.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-[#121a28] p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('admin.analytics.density_title')}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[...points]
              .sort((a, b) => b.weight - a.weight)
              .map((pt, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{
                      background:
                        pt.weight >= 10 ? '#EF4444' : pt.weight >= 5 ? '#F59E0B' : '#60A5FA',
                    }}
                  />
                  <span className="truncate font-mono text-xs text-slate-300">
                    {pt.lat.toFixed(3)}, {pt.lng.toFixed(3)}
                  </span>
                  <span className="ml-auto shrink-0 text-slate-500">{pt.weight}</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
