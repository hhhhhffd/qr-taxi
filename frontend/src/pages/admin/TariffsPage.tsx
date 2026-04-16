/**
 * TariffsPage — editable form for all tariff params + global settings.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { adminApi } from '../../api/admin'
import type { TariffSettings, TariffConfig } from '../../types'

const TARIFF_KEYS = ['econom', 'optimal', 'comfort', 'universal', 'minivan'] as const
type TariffKey = (typeof TARIFF_KEYS)[number]

function TariffField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-aparu-brand"
      />
    </div>
  )
}

export default function TariffsPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<TariffSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .getTariffs()
      .then(setConfig)
      .catch(() => setError(t('admin.errors.tariff_load')))
      .finally(() => setLoading(false))
  }, [t])

  const updateTariffField = (
    key: TariffKey,
    field: keyof TariffConfig,
    value: number | string,
  ) => {
    setConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        tariffs: {
          ...prev.tariffs,
          [key]: { ...prev.tariffs[key], [field]: value },
        },
      }
    })
    setSaved(false)
  }

  const updateGlobal = (field: keyof Omit<TariffSettings, 'tariffs'>, value: number) => {
    setConfig((prev) => {
      if (!prev) return prev
      return { ...prev, [field]: value }
    })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const updated = await adminApi.updateTariffs(config)
      setConfig(updated)
      setSaved(true)
    } catch {
      setError(t('admin.errors.tariff_save'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-52 animate-pulse rounded bg-white/10" />
          <div className="h-9 w-20 animate-pulse rounded-lg bg-white/10" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-[#121a28] p-5">
            <div className="mb-4 h-5 w-32 animate-pulse rounded bg-white/10" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {Array.from({ length: 6 }).map((__, j) => (
                <div key={j} className="h-14 animate-pulse rounded bg-white/10" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!config) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
        {error ?? t('admin.errors.generic')}
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.tariffs.page_title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('admin.tariffs.page_subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {saved && (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              {t('admin.saved')}
            </span>
          )}
          {error && (
            <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-xs text-red-300">
              {error}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-aparu-brand px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {saving ? t('admin.actions.saving') : t('buttons.save')}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {TARIFF_KEYS.map((key) => {
          const tariff = config.tariffs[key]
          if (!tariff) return null
          return (
            <section key={key} className="rounded-2xl border border-white/10 bg-[#121a28] p-5">
              <h2 className="mb-4 text-base font-semibold text-white">
                {t(`tariffs.${key}`)}
                <span className="ml-2 text-xs font-normal text-slate-500">({key})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                <TariffField
                  label={t('admin.tariffs.fields.base_fare')}
                  value={tariff.base_fare}
                  onChange={(v) => updateTariffField(key, 'base_fare', v)}
                />
                <TariffField
                  label={t('admin.tariffs.fields.base_km')}
                  value={tariff.base_km}
                  step={0.5}
                  onChange={(v) => updateTariffField(key, 'base_km', v)}
                />
                <TariffField
                  label={t('admin.tariffs.fields.per_km')}
                  value={tariff.per_km}
                  step={5}
                  onChange={(v) => updateTariffField(key, 'per_km', v)}
                />
                <TariffField
                  label={t('admin.tariffs.fields.free_wait')}
                  value={tariff.free_wait_min}
                  onChange={(v) => updateTariffField(key, 'free_wait_min', v)}
                />
                <TariffField
                  label={t('admin.tariffs.fields.wait_per_min')}
                  value={tariff.wait_per_min}
                  onChange={(v) => updateTariffField(key, 'wait_per_min', v)}
                />
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t('admin.tariffs.fields.car_type')}</label>
                  <select
                    value={tariff.car_type}
                    onChange={(e) => updateTariffField(key, 'car_type', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-[#0f1725] px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-aparu-brand"
                  >
                    <option value="sedan">sedan</option>
                    <option value="universal">universal</option>
                    <option value="minivan">minivan</option>
                  </select>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#121a28] p-5">
        <h2 className="mb-4 text-base font-semibold text-white">{t('admin.tariffs.global.title')}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <TariffField
            label={t('admin.tariffs.global.time_surcharge_after')}
            value={config.time_surcharge_after_min}
            step={1}
            onChange={(v) => updateGlobal('time_surcharge_after_min', v)}
          />
          <TariffField
            label={t('admin.tariffs.global.time_surcharge_per_min')}
            value={config.time_surcharge_per_min}
            step={5}
            onChange={(v) => updateGlobal('time_surcharge_per_min', v)}
          />
          <TariffField
            label={t('admin.tariffs.global.max_distance')}
            value={config.max_distance_km}
            step={5}
            onChange={(v) => updateGlobal('max_distance_km', v)}
          />
          <TariffField
            label={t('admin.tariffs.global.search_timeout')}
            value={config.search_timeout_sec}
            step={10}
            onChange={(v) => updateGlobal('search_timeout_sec', v)}
          />
          <TariffField
            label={t('admin.tariffs.global.driver_wait_timeout')}
            value={config.driver_wait_timeout_min}
            step={1}
            onChange={(v) => updateGlobal('driver_wait_timeout_min', v)}
          />
          <TariffField
            label={t('admin.tariffs.global.surge_multiplier')}
            value={config.surge_multiplier}
            step={0.1}
            onChange={(v) => updateGlobal('surge_multiplier', v)}
          />
        </div>
      </section>
    </div>
  )
}
