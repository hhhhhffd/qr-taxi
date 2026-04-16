import { useTranslation } from 'react-i18next'
import { TARIFFS, calculatePrice, formatPrice } from '../utils/price'
import type { Tariff } from '../types'

interface TariffSelectorProps {
  route: any | null // Or RouteResponse from types
  onSelect: (tariff: Tariff) => void
  selected: Tariff | null
}

export default function TariffSelector({ route, onSelect, selected }: TariffSelectorProps) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.resolvedLanguage || 'ru'
  const taxiLabel = t('order.by_taximeter')

  const getTariffName = (tariff: Tariff) => {
    if (currentLang === 'kz') return tariff.name_kz
    if (currentLang === 'en') return tariff.name_en
    return tariff.name_ru
  }

  const grouped = {
    sedan: TARIFFS.filter(t => t.car_type === 'sedan'),
    van: TARIFFS.filter(t => t.car_type !== 'sedan')
  }

  return (
    <div className="w-full">
      <div className="flex overflow-x-auto gap-3 pb-2 snap-x hide-scrollbar">
        {grouped.sedan.map((tariff) => {
          const price = route ? calculatePrice(tariff, route) : tariff.base_fare
          const isSelected = selected?.key === tariff.key
          return (
            <button
              key={tariff.key}
              onClick={() => onSelect(tariff)}
              className={`snap-start shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all w-24 ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-3xl mb-1">🚗</div>
              <div className="text-sm font-medium text-gray-800">{getTariffName(tariff)}</div>
              <div className="text-xs text-gray-500 mt-1">{formatPrice(price, taxiLabel)}</div>
            </button>
          )
        })}
        
        {grouped.van.map((tariff) => {
          const price = route ? calculatePrice(tariff, route) : tariff.base_fare
          const isSelected = selected?.key === tariff.key
          return (
            <button
              key={tariff.key}
              onClick={() => onSelect(tariff)}
              className={`snap-start shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all w-24 ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-3xl mb-1">🚐</div>
              <div className="text-sm font-medium text-gray-800">{getTariffName(tariff)}</div>
              <div className="text-xs text-gray-500 mt-1">{formatPrice(price, taxiLabel)}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
